const _ = require('lodash');
const BPromise = require('bluebird');
const geolib = require('geolib');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const printmotorCore = require('../core/printmotor-core');
const { knex } = require('../util/database');
const { filterMapPosterCart } = require('../util');

function main(opts = {}) {
  logger.info('Checking for new orders to send to production ..');

  return orderCore.getOrdersReadyToProduction()
    .then((orders) => {
      logger.logEncrypted('info', 'Found orders:', orders);
      logger.info(`Found ${orders.length} orders ready for Printmotor ..`);

      return BPromise.each(orders, (order) => {
        logger.info(`Creating order to Printmotor (#${order.orderId}) ..`);

        return assertMapCentersInsideBounds(order)
          .then(() => printmotorCore.createOrder(order))
          .tap(() => logger.info(`Sent order to Printmotor (#${order.orderId})`))
          .then((result) => {
            const printmotorId = String(result.response.orderNumber);
            return orderCore.markOrderSentToProduction(
              order.orderId,
              printmotorId,
              result.response,
              result.requestParams,
            );
          })
          .then(() => logger.info(`Marked order as sent to production (#${order.orderId})`))
          .catch((err) => {
            logSingleProcessError(err, order);
            logger.info('Continuing with next order ..');
            if (opts.throwOnError) {
              throw err;
            }
            // Otherwis ignore error for single order creation
          });
      })
        .then(() => orderCore.getPartiallyPaidOrders());
    })
    .then((orders) => {
      if (orders.length > 0) {
        logger.warn(`alert-critical Found ${orders.length} PARTIALLY paid orders!`);
        logger.warn(`Found partially paid orders: ${_.map(orders, 'orderId')}`);
      }

      return orderCore.getOldUnpaidOrders();
    })
    .then(async (orders) => {
      if (orders.length > 0) {
        const orderIds = _.map(orders, 'orderId');
        logger.warn(`alert-critical Deleting ${orders.length} UNPAID orders!`);
        logger.warn(`Found unpaid orders: ${orderIds}`);

        await orderCore.deleteOrders(orderIds);
      }
    })
    .catch((err) => {
      logError(err);
      throw err;
    });
}

function assertMapCentersInsideBounds(order) {
  return BPromise.each(filterMapPosterCart(order.cart), (item) => {
    const { mapCenter, mapBounds } = item.customisation;
    // This is not accurate but it's a safe measure to prevent missync
    // between map center and bounds
    const isInside = geolib.isPointInside(mapCenter, [
      { lat: mapBounds.northEast.lat, lng: mapBounds.northEast.lng },
      { lat: mapBounds.northEast.lat, lng: mapBounds.southWest.lng },
      { lat: mapBounds.southWest.lat, lng: mapBounds.southWest.lng },
      { lat: mapBounds.southWest.lat, lng: mapBounds.northEast.lng },
    ]);

    if (!isInside) {
      return BPromise.reject(new Error('Map center isn\'t inside map bounds'));
    }

    return BPromise.resolve();
  });
}

function logSingleProcessError(err, order) {
  logger.error(`alert-business-critical Error when creating order to Printmotor (#${order.orderId}): ${err}`);
  logger.error(err.stack || err);
}

function logError(err) {
  logger.error('alert-critical Error when sending posters to production', err);
  logger.error(err.stack || err);
}

function stop(signal) {
  logger.info(`${signal} received, stopping worker..`);
  knex.destroy();
  process.exit();
}

if (require.main === module) {
  // Run the worker if script is directly executed
  main()
    .finally(() => stop('"Natural exit"'));

  process.on('SIGTERM', stop.bind(this, 'SIGTERM'));
  process.on('SIGINT', stop.bind(this, 'SIGINT(Ctrl-C)'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception!');
    logError(err);
  });
}

module.exports = {
  main,
};

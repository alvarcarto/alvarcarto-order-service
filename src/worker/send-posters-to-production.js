const BPromise = require('bluebird');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const printmotorCore = require('../core/printmotor-core');
const { knex } = require('../util/database');

function main() {
  logger.info('Checking for new orders to send to production ..');

  return orderCore.getOrdersReadyToProduction()
    .then((orders) => {
      logger.logEncrypted('info', 'Found orders:', orders);
      logger.info(`Found ${orders.length} orders ready for Printmotor ..`);

      return BPromise.each(orders, (order) => {
        logger.info(`Creating order to Printmotor (#${order.orderId}) ..`);

        return printmotorCore.createOrder(order)
          .tap(() => logger.info(`Sent order to Printmotor (#${order.orderId})`))
          .then(result =>
            orderCore.markOrderSentToProduction(order.orderId, result.requestParams)
          )
          .then(() => logger.info(`Marked order as sent to production (#${order.orderId})`));
      });
    })
    .catch((err) => {
      logError(err);
      throw err;
    });
}

function logError(err) {
  logger.error('alert-1h Error when sending posters to production', err);
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

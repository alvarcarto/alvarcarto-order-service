const BPromise = require('bluebird');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const bucketCore = require('../core/bucket-core');
const printmotorCore = require('../core/printmotor-core');
const { knex } = require('../util/database');

function main() {
  logger.info('Uploading receipts for all orders to S3 ..');

  return orderCore.getOrders()
    .then((orders) => {
      logger.info(`Found ${orders.length} orders ..`);

      return BPromise.each(orders, (order) => {
        logger.info(`Uploading receipt for (#${order.orderId}) ..`);

        return bucketCore.uploadReceipt(order)
          .tap(() => logger.info(`Uploaded receipt for (#${order.orderId})`))
          .catch((err) => {
            logSingleProcessError(err, order);
            logger.info('Continuing with next order ..');
            // Ignore error for single order creation
          });
      });
    })
    .catch((err) => {
      logError(err);
      throw err;
    });
}

function logSingleProcessError(err, order) {
  logger.error(`alert-1h Error when creating order to Printmotor (#${order.orderId}): ${err}`);
  logger.error(err.stack || err);
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

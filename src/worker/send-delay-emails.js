const _ = require('lodash');
const BPromise = require('bluebird');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const emailCore = require('../core/email-core');
const { knex } = require('../util/database');
require('../configure-moment');

function main(opts = {}) {
  logger.info('Checking for orders that are late ..');

  return orderCore.getOrdersWithTooLongProductionTime()
    .then((orders) => {
      logger.info(`Found ${orders.length} late orders`);

      if (orders.length < 1) {
        logger.info('All ok, exiting.');
        return BPromise.resolve();
      }

      logger.logEncrypted('info', 'Found orders:', orders);

      return emailCore.sendDeliveryReminderToPrintmotor(orders)
        .then(() => {
          return BPromise.each(orders, (order) => {
            logger.info(`Sending an email about late order (#${order.orderId}) ..`);

            const hasBeenSent = _.findIndex(order.sentEmails, e => e.type === 'delivery-late') !== -1;
            if (hasBeenSent) {
              logger.info(`Delivery late notification already sent for (#${order.orderId}).`);
              return BPromise.resolve();
            }

            return emailCore.sendDeliveryLate(order)
              .catch((err) => {
                logSingleProcessError(err, order);
                logger.info('Continuing with next order ..');
                if (opts.throwOnError) {
                  throw err;
                }
                // Otherwise ignore error for single order creation
              });
          });
        });
    })
    .catch((err) => {
      logError(err);
      throw err;
    });
}


function logSingleProcessError(err, order) {
  logger.error(`alert-normal Error when sending an email about late delivery (#${order.orderId}): ${err}`);
  logger.error(err.stack || err);
}

function logError(err) {
  logger.error('alert-normal Error when sending reminder emails', err);
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

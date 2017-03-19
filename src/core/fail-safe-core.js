const _ = require('lodash');
const promiseRetryify = require('promise-retryify');
const logger = require('../util/logger')(__filename);
const { knex } = require('../util/database');

function saveFailedOrder(fullOrder, originalErr) {
  return knex('failed_orders')
    .insert({
      pretty_order_id: _.get(fullOrder, 'prettyOrderId') || '',
      full_order: fullOrder,
      error_message: originalErr.message || '',
      error_code: String(originalErr.code) || '',
      error_stack: String(originalErr.stack) || '',
    })
    .then(() => {
      logger.warn(`alert-1h Saved failed order to failed_orders: #${fullOrder.prettyOrderId}`);
    })
    .catch((err) => {
      logger.error(`alert-1h Couldn't save failed order: ${fullOrder.prettyOrderId}. Error: ${err}`);
      throw err;
    });
}

const retryingSaveFailedOrder = promiseRetryify(saveFailedOrder, {
  maxRetries: 20,
  // 10ms, 20ms, 40ms, 80ms, 160ms, 320ms, 640ms, 1000ms, 1000ms, 1000ms ...
  retryTimeout: retryCount => Math.min(Math.pow(2, retryCount) * 10, 1000),
  beforeRetry: retryCount => logger.warn(`Retrying to save failed order (${retryCount}) ..`),
  onAllFailed: (err, fullOrder) => {
    logger.error(`alert-1h Couldn't save failed order in any way: ${fullOrder.prettyOrderId}`);
    // We never log personal info about customers, but
    // this is a VERY rare case and we want to maximise success to help
    // the customer.
    logger.error(`Contact this customer email: ${fullOrder.email}`);
    throw err;
  },
});

module.exports = {
  saveFailedOrder,
  retryingSaveFailedOrder,
};

const BPromise = require('bluebird');
const ex = require('../util/express');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const checkoutCore = require('../core/checkout-core');

const postOrder = ex.createJsonRoute((req) => {
  return checkoutCore.executeCheckout(req.body);
});

const postWebhook = ex.createJsonRoute((req) => {
  logger.logEncrypted('info', 'alert-1h Webhook called:', req.body);
  return BPromise.resolve(undefined);
});

const getOrder = ex.createJsonRoute((req) => {
  return orderCore.getOrder(req.params.orderId)
    .then((order) => {
      if (!order) {
        return ex.throwStatus(404, 'Order not found');
      }

      return order;
    });
});

module.exports = {
  postOrder,
  postWebhook,
  getOrder,
};

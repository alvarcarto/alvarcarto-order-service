const _ = require('lodash');
const ex = require('../util/express');
const orderCore = require('../core/order-core');
const checkoutCore = require('../core/checkout-core');

const postOrder = ex.createJsonRoute((req) => {
  if (_hasShippableProducts(req.body.cart) && !req.body.shippingAddress) {
    return ex.throwStatus(400, 'Shipping address is required if cart has shippable products');
  }

  return checkoutCore.executeCheckout(req.body);
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

function _hasShippableProducts(cart) {
  return _.some(cart, item => item.type !== 'giftCardValue');
}

module.exports = {
  postOrder,
  getOrder,
};

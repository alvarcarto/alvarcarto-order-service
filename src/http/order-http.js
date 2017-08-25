const ex = require('../util/express');
const orderCore = require('../core/order-core');
const checkoutCore = require('../core/checkout-core');

const postOrder = ex.createJsonRoute((req) => {
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

module.exports = {
  postOrder,
  getOrder,
};

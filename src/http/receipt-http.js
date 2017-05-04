const ex = require('../util/express');
const orderCore = require('../core/order-core');
const emailCore = require('../core/email-core');

const getReceipt = ex.createRoute((req, res) => {
  return orderCore.getOrder(req.params.orderId, { allFields: true })
    .then((order) => {
      if (!order) {
        return ex.throwStatus(404, 'Order not found');
      }

      return emailCore.renderReceiptToHtml(order);
    })
    .then((html) => {
      res.send(html);
      res.end();
    });
});

module.exports = {
  getReceipt,
};

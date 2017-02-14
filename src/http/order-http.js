const _ = require('lodash');
const ex = require('../util/express');
const orderCore = require('../core/order-core');

const postOrder = ex.createJsonRoute((req, res) => {
  return orderCore.render(req.body);
});

module.exports = {
  postOrder,
};

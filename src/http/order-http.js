const _ = require('lodash');
const BPromise = require('bluebird');
const ex = require('../util/express');
const orderCore = require('../core/order-core');
const stripe = require('../util/stripe');

const postOrder = ex.createJsonRoute((req) => {
  const price = { value: 1000, currency: 'eur' };

  return BPromise.resolve(stripe.charges.create({
    amount: price.value,
    currency: price.currency,
    source: req.body.stripeTokenResponse.id,
    receipt_email: req.body.email,
    description: `Charge for ${req.body.email}`,
    statement_descriptor: 'alvarcarto.com',
  }))
    .then((response) => {
      const order = _.merge({}, req.body, {
        stripeChargeResponse: response,
      });

      return orderCore.createOrder(order);
    })
    // Return with empty body
    .then(() => undefined);
});

module.exports = {
  postOrder,
};

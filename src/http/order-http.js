const _ = require('lodash');
const BPromise = require('bluebird');
const { calculateCartPrice } = require('alvarcarto-price-util');
const ex = require('../util/express');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const stripe = require('../util/stripe');

const SAFE_LIMIT_MIN = 20 * 100;
const SAFE_LIMIT_MAX = 10000 * 100;

const postOrder = ex.createJsonRoute((req) => {
  const price = calculateCartPrice(req.body.cart);
  if (price.value < SAFE_LIMIT_MIN) {
    logger.error(`Calculated price exceeded minimum safe limit: ${price}`);
    ex.throwStatus(500, 'Internal price calculation failed');
  }
  if (price.value > SAFE_LIMIT_MAX) {
    logger.error(`Calculated price exceeded maximum safe limit: ${price}`);
    ex.throwStatus(500, 'Internal price calculation failed');
  }

  return BPromise.resolve(stripe.charges.create({
    amount: price.value,
    currency: price.currency.toLowerCase(),
    source: req.body.stripeTokenResponse.id,
    metadata: req.body,
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

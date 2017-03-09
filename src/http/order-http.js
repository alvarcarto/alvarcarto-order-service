const _ = require('lodash');
const BPromise = require('bluebird');
const { calculateCartPrice } = require('alvarcarto-price-util');
const ex = require('../util/express');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const stripe = require('../util/stripe');

const STRIPE_META_KEY_MAX_LEN = 40;
const STRIPE_META_VALUE_MAX_LEN = 500;
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
    metadata: fixStripeMeta({
      posterCount: _.reduce(req.body.cart, (memo, item) => memo + item.quantity, 0),
      postersSummary: _.map(req.body.cart, item => `${item.quantity}x ${item.labelHeader}`).join(', '),
      sizes: _.map(req.body.cart, item => item.size).join(', '),
      styles: _.map(req.body.cart, item => item.mapStyle).join(', '),
      headers: _.map(req.body.cart, item => item.labelHeader).join(', '),
      smallHeaders: _.map(req.body.cart, item => item.labelSmallHeader).join(', '),
      texts: _.map(req.body.cart, item => item.labelText).join(', '),
      shippingName: req.body.shippingAddress.name,
      shippingAddress: req.body.shippingAddress.address,
      shippingAddressExtra: req.body.shippingAddress.addressExtra,
      shippingCity: req.body.shippingAddress.city,
      shippingPostalCode: req.body.shippingAddress.postalCode,
      shippingCountry: req.body.shippingAddress.country,
      shippingState: req.body.shippingAddress.state,
      shippingPhone: req.body.shippingAddress.phone,
    }),
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

function fixStripeMeta(obj) {
  const newObj = {};
  _.each(obj, (val, key) => {
    if (!val) {
      return;
    }

    const newKey = ensureLength(key, STRIPE_META_KEY_MAX_LEN);
    newObj[newKey] = ensureLength(String(val), STRIPE_META_VALUE_MAX_LEN);
  });

  return newObj;
}

function ensureLength(text, length) {
  if (text.length <= length) {
    return text;
  }

  const suffix = '...';
  return text.slice(0, length - suffix.length) + suffix;
}

module.exports = {
  postOrder,
};

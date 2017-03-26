const _ = require('lodash');
const BPromise = require('bluebird');
const { calculateCartPrice } = require('alvarcarto-price-util');
const ex = require('../util/express');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const stripe = require('../util/stripe');

const STRIPE_META_KEY_MAX_LEN = 40;
const STRIPE_META_VALUE_MAX_LEN = 500;
const SAFE_LIMIT_MIN = 25 * 100;
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

  const shippingAddress = req.body.shippingAddress;
  const stripeCharge = {
    amount: price.value,
    currency: price.currency.toLowerCase(),
    source: req.body.stripeTokenResponse.id,
    metadata: fixStripeMeta({
      posterQuantities: _.map(req.body.cart, item => `${item.quantity}x`).join('; '),
      sizes: _.map(req.body.cart, item => item.size).join('; '),
      orientations: _.map(req.body.cart, item => item.orientation).join('; '),
      styles: _.map(req.body.cart, item => item.mapStyle).join('; '),
      headers: _.map(req.body.cart, item => item.labelHeader).join('; '),
      smallHeaders: _.map(req.body.cart, item => item.labelSmallHeader).join('; '),
      texts: _.map(req.body.cart, item => item.labelText).join('; '),
      coords: _.map(req.body.cart, item => mapBoundsToStr(item.mapBounds)).join('; '),
      shippingName: shippingAddress.name,
      shippingAddress: shippingAddress.address,
      shippingAddressExtra: shippingAddress.addressExtra,
      shippingCountry: `${shippingAddress.country}, state: ${shippingAddress.state}`,
      shippingCity: `${shippingAddress.postalCode}, ${shippingAddress.city}`,
      shippingPhone: shippingAddress.phone,
    }),
    receipt_email: req.body.email,
    description: `Charge for ${req.body.email}`,
    statement_descriptor: 'alvarcarto.com',
  };

  let order;
  return BPromise.resolve(stripe.charges.create(stripeCharge))
    .then((response) => {
      order = _.merge({}, req.body, {
        chargedPrice: price,  // Saved in case of failures
        stripeChargeRequest: stripeCharge,
        stripeChargeResponse: response,
      });

      return orderCore.createOrder(order);
    })
    .then(obj => ({
      orderId: obj.orderId,
    }))
    .catch((err) => {
      logger.error('alert-1h Creating order failed!');
      logger.logEncrypted('error', 'Stripe charge:', stripeCharge);
      logger.logEncrypted('error', 'Full order:', order);
      throw err;
    });
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

function mapBoundsToStr(bounds) {
  let coordStr = `${bounds.southWest.lat} ${bounds.southWest.lng}`;
  coordStr += `, ${bounds.northEast.lat} ${bounds.northEast.lng}`;
  return coordStr;
}

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
  getOrder,
};

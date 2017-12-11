const _ = require('lodash');
const BPromise = require('bluebird');
const { oneLine } = require('common-tags');
const { calculateCartPrice } = require('alvarcarto-price-util');
const logger = require('../util/logger')(__filename);
const { throwStatus } = require('../util/express');
const orderCore = require('../core/order-core');
const emailCore = require('../core/email-core');
const promotionCore = require('../core/promotion-core');
const stripe = require('../util/stripe');
const config = require('../config');

const STRIPE_META_KEY_MAX_LEN = 40;
const STRIPE_META_VALUE_MAX_LEN = 500;
const HARD_LIMIT_MAX = 10000 * 100;
const ALERT_LIMIT_MIN = 25 * 100;
const ALERT_LIMIT_MAX = 500 * 100;

function executeCheckout(inputOrder) {
  let order;
  let stripeCharge = null;
  return _getPromotion(inputOrder.promotionCode)
    .then((promotion) => {
      if (_.get(promotion, 'hasExpired')) {
        throwStatus(400, `Promotion code ${promotion.promotionCode} has expired`);
      }

      // Promotion is either null or promotion object
      const price = calculateCartPrice(inputOrder.cart, { promotion });
      if (price.value >= HARD_LIMIT_MAX) {
        logger.error(`Calculated price exceeded maximum safe limit: ${price}`);
        throwStatus(400, oneLine`
          The total price of the order is very high.
          Please contact help@alvarcarto.com to continue with the order.
        `);
      }

      if (price.value >= ALERT_LIMIT_MAX) {
        logger.warn(`alert-10m Calculated price was over alert limit: ${price.label}`);
        logger.logEncrypted('warn', 'Full incoming order:', inputOrder);
      }

      if (price.value <= ALERT_LIMIT_MIN) {
        logger.warn(`alert-10m Calculated price was under low alert limit: ${price.label}`);
        logger.logEncrypted('warn', 'Full incoming order:', inputOrder);
      }

      const isFreeOrder = price.value <= 0;
      if (!isFreeOrder && !_.has(inputOrder, 'stripeTokenResponse')) {
        logger.warn('alert-1h Request without stripeTokenResponse noticed');
        logger.logEncrypted('warn', 'Full incoming order:', inputOrder);

        throwStatus(400, 'Required field stripeTokenResponse is missing.');
      }

      if (isFreeOrder) {
        // User has used a promotion code which allows a free purchase
        return BPromise.props({
          price,
          stripeChargeResponse: null,
        });
      }

      const shippingAddress = inputOrder.shippingAddress;
      stripeCharge = _createStripeChargeObject(inputOrder, shippingAddress, price);

      return BPromise.props({
        price,
        stripeChargeResponse: stripe.charges.create(stripeCharge),
      });
    })
    .then((result) => {
      const { price, stripeChargeResponse } = result;

      order = _.merge({}, inputOrder, {
        chargedPrice: price,  // Saved in case of failures
        stripeChargeRequest: stripeCharge,
        stripeChargeResponse,
      });

      return orderCore.createOrder(order);
    })
    .tap((createdOrder) => {
      const orderWithId = _.merge({
        orderId: createdOrder.orderId,
        promotion: createdOrder.promotion,
        createdAt: createdOrder.createdAt,
      }, order);

      logger.info('alert-10m New order received!');
      return emailCore.sendReceipt(orderWithId);
    })
    .tap((createdOrder) => {
      if (createdOrder.promotion) {
        return promotionCore.increasePromotionUsageCount(createdOrder.promotion.promotionCode);
      }

      return BPromise.resolve();
    })
    .then(createdOrder => ({
      orderId: createdOrder.orderId,
    }))
    .catch((err) => {
      logger.error('alert-1h Creating order failed!');
      logger.logEncrypted('error', 'Stripe charge:', stripeCharge);
      logger.logEncrypted('error', 'Full order:', order);
      throw err;
    });
}

function _createStripeChargeObject(inputOrder, shippingAddress, price) {
  return {
    amount: price.value,
    currency: price.currency.toLowerCase(),
    source: inputOrder.stripeTokenResponse.id,
    metadata: fixStripeMeta({
      posterQuantities: _.map(inputOrder.cart, item => `${item.quantity}x`).join('; '),
      sizes: _.map(inputOrder.cart, item => item.size).join('; '),
      orientations: _.map(inputOrder.cart, item => item.orientation).join('; '),
      mapStyles: _.map(inputOrder.cart, item => item.mapStyle).join('; '),
      posterStyles: _.map(inputOrder.cart, item => item.posterStyle).join('; '),
      headers: _.map(inputOrder.cart, item => item.labelHeader).join('; '),
      smallHeaders: _.map(inputOrder.cart, item => item.labelSmallHeader).join('; '),
      texts: _.map(inputOrder.cart, item => item.labelText).join('; '),
      coords: _.map(inputOrder.cart, item => mapBoundsToStr(item.mapBounds)).join('; '),
      shippingName: shippingAddress.personName,
      shippingAddress: shippingAddress.streetAddress,
      shippingAddressExtra: shippingAddress.streetAddressExtra,
      shippingCountry: `${shippingAddress.countryCode}, state: ${shippingAddress.state}`,
      shippingCity: `${shippingAddress.postalCode}, ${shippingAddress.city}`,
      shippingPhone: shippingAddress.contactPhone,
    }),
    description: `Charge for ${inputOrder.email}`,
    statement_descriptor: config.CREDIT_CARD_STATEMENT_NAME,
  };
}

function _getPromotion(code) {
  if (!code) {
    return BPromise.resolve(null);
  }

  return promotionCore.getPromotion(code);
}

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
  executeCheckout,
};

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
const { filterMapPosterCart } = require('../util');
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
        logger.warn(`alert-business-critical Calculated price was over alert limit: ${price.label}`);
        logger.logEncrypted('warn', 'Full incoming order:', inputOrder);
      }

      if (price.value <= ALERT_LIMIT_MIN) {
        logger.warn(`Calculated price was under low alert limit: ${price.label}`);
        logger.logEncrypted('warn', 'Full incoming order:', inputOrder);
      }

      const isFreeOrder = price.value <= 0;
      if (!isFreeOrder && !_.has(inputOrder, 'stripeTokenResponse')) {
        logger.warn('alert-critical Request without stripeTokenResponse noticed');
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

      stripeCharge = _createStripeChargeObject(inputOrder, price);

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

      logger.info('New order received!');
      return emailCore.sendReceipt(orderWithId);
    })
    .tap(createdOrder => orderCore.addEmailSent(createdOrder.orderId, 'receipt'))
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
      logger.error('alert-normal Creating order failed!');
      logger.logEncrypted('error', 'Stripe charge:', stripeCharge);
      logger.logEncrypted('error', 'Full order:', order);
      throw err;
    });
}

function _createStripeChargeObject(inputOrder, price) {
  return {
    amount: price.value,
    currency: price.currency.toLowerCase(),
    source: inputOrder.stripeTokenResponse.id,
    metadata: _createStripeMetaData(inputOrder),
    description: `Charge for ${inputOrder.email}`,
    statement_descriptor: config.CREDIT_CARD_STATEMENT_NAME,
  };
}

function _createStripeMetaData(inputOrder) {
  const { shippingAddress } = inputOrder;
  const meta = {};
  if (_.isPlainObject(shippingAddress)) {
    meta.shippingName = shippingAddress.personName;
    meta.shippingAddress = shippingAddress.streetAddress;
    meta.shippingAddressExtra = shippingAddress.streetAddressExtra;
    meta.shippingCountry = `${shippingAddress.countryCode}, state: ${shippingAddress.state}`;
    meta.shippingCity = `${shippingAddress.postalCode}, ${shippingAddress.city}`;
    meta.shippingPhone = shippingAddress.contactPhone;
  }

  const mapCart = filterMapPosterCart(inputOrder.cart);
  return trimStripeMeta(_.merge(meta, _createCartMetas(mapCart)));
}

function _createCartMetas(cart) {
  return {
    itemTypes: _.map(cart, item => _.get(item, 'type')).join('; '),
    posterQuantities: _.map(cart, item => `${_.get(item, 'quantity')}x`).join('; '),
    sizes: _.map(cart, item => _.get(item, 'size')).join('; '),
    orientations: _.map(cart, item => _.get(item, 'orientation')).join('; '),
    mapStyles: _.map(cart, item => _.get(item, 'mapStyle')).join('; '),
    posterStyles: _.map(cart, item => _.get(item, 'posterStyle')).join('; '),
    headers: _.map(cart, item => _.get(item, 'labelHeader')).join('; '),
    smallHeaders: _.map(cart, item => _.get(item, 'labelSmallHeader')).join('; '),
    texts: _.map(cart, item => _.get(item, 'labelText')).join('; '),
    coords: _.map(cart, item => mapBoundsToStr(_.get(item, 'mapBounds'))).join('; '),
  };
}

function _getPromotion(code) {
  if (!code) {
    return BPromise.resolve(null);
  }

  return promotionCore.getPromotion(code);
}

function mapBoundsToStr(bounds) {
  if (!bounds) {
    return '';
  }

  let coordStr = `${bounds.southWest.lat} ${bounds.southWest.lng}`;
  coordStr += `, ${bounds.northEast.lat} ${bounds.northEast.lng}`;
  return coordStr;
}

function trimStripeMeta(obj) {
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

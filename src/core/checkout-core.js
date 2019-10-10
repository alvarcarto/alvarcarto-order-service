const _ = require('lodash');
const { oneLine } = require('common-tags');
const { calculateCartPrice } = require('alvarcarto-price-util');
const logger = require('../util/logger')(__filename);
const { throwStatus } = require('../util/express');
const orderCore = require('../core/order-core');
const emailCore = require('../core/email-core');
const promotionCore = require('../core/promotion-core');
const { stripeInstance } = require('../util/stripe');
const { filterMapPosterCart } = require('../util');
const config = require('../config');

const STRIPE_META_KEY_MAX_LEN = 40;
const STRIPE_META_VALUE_MAX_LEN = 500;
const HARD_LIMIT_MAX = 10000 * 100;
const ALERT_LIMIT_MIN = 25 * 100;
const ALERT_LIMIT_MAX = 500 * 100;

async function executeCheckout(inputOrder) {
  const promotion = await promotionCore.getPromotion(inputOrder.promotionCode);
  if (_.get(promotion, 'hasExpired')) {
    throwStatus(400, `Promotion code ${promotion.promotionCode} has expired`);
  }

  // Promotion is either null or promotion object
  const price = calculateCartPrice(inputOrder.cart, { currency: inputOrder.currency, promotion });
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

  const createdOrder = await orderCore.createOrder(inputOrder);

  const isFreeOrder = price.value <= 0;
  if (isFreeOrder) {
    const originalPrice = calculateCartPrice(inputOrder.cart, { currency: inputOrder.currency });
    await orderCore.createPayment(createdOrder.orderId, {
      paymentProvider: 'PROMOTION',
      type: 'CHARGE',
      amount: originalPrice.value,
      currency: price.currency,
      promotionCode: inputOrder.promotionCode,
    });

    const fullOrder = await orderCore.getOrder(createdOrder.orderId, { allFields: true });
    await emailCore.sendReceipt(fullOrder);

    return createdOrder;
  }

  // Use a complete order object which contains the orderId and all address details
  const mergedOrder = _.merge({}, inputOrder, createdOrder);
  const stripePaymentIntent = _createStripePaymentIntentObject(mergedOrder, price);
  const stripePaymentIntentRes = await stripeInstance.paymentIntents.create(stripePaymentIntent);

  return _.merge({}, createdOrder, {
    stripePaymentIntent: _.pick(stripePaymentIntentRes, ['client_secret']),
  });
}

function _createStripePaymentIntentObject(fullOrder, price) {
  return {
    payment_method_types: ['card'],
    amount: price.value,
    currency: price.currency.toLowerCase(),
    metadata: createStripeMetadata(fullOrder),
    description: `Charge for ${fullOrder.email}`,
    statement_descriptor: config.CREDIT_CARD_STATEMENT_NAME,
  };
}

function createStripeMetadata(fullOrder) {
  const { shippingAddress } = fullOrder;
  const meta = {
    prettyOrderId: fullOrder.orderId,
  };

  if (fullOrder.promotionCode) {
    meta.promotionCode = fullOrder.promotionCode;
  }

  if (_.isPlainObject(shippingAddress)) {
    meta.shippingName = shippingAddress.personName;
    meta.shippingAddress = shippingAddress.streetAddress;
    meta.shippingAddressExtra = shippingAddress.streetAddressExtra;
    meta.shippingCountry = `${shippingAddress.countryCode}, state: ${shippingAddress.state}`;
    meta.shippingCity = `${shippingAddress.postalCode}, ${shippingAddress.city}`;
    meta.shippingPhone = shippingAddress.contactPhone;
  }

  const mapCart = filterMapPosterCart(fullOrder.cart);
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
  createStripeMetadata,
};

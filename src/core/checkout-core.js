const _ = require('lodash');
const { calculateCartPrice, isSupportedCurrency } = require('alvarcarto-price-util');
const { throwStatus } = require('../util/express');
const orderCore = require('../core/order-core');
const emailCore = require('../core/email-core');
const promotionCore = require('../core/promotion-core');
const { stripeInstance } = require('../util/stripe');
const { filterMapPosterCart, getShipToCountry } = require('../util');
const config = require('../config');

const STRIPE_META_KEY_MAX_LEN = 40;
const STRIPE_META_VALUE_MAX_LEN = 500;

async function executeCheckout(inputOrder) {
  const promotion = await promotionCore.getPromotion(inputOrder.promotionCode);
  if (_.get(promotion, 'hasExpired')) {
    throwStatus(400, `Promotion code ${promotion.promotionCode} has expired`);
  }

  if (!isSupportedCurrency(inputOrder.currency)) {
    throwStatus(400, `Unaccepted currency: ${inputOrder.currency}`);
  }

  const shipToCountry = getShipToCountry(inputOrder);
  // Promotion is either null or promotion object
  const price = calculateCartPrice(inputOrder.cart, {
    currency: inputOrder.currency,
    shipToCountry,
    promotion,
  });

  const createdOrder = await orderCore.createOrder(inputOrder);

  const isFreeOrder = price.value <= 0;
  if (isFreeOrder) {
    const originalPrice = calculateCartPrice(inputOrder.cart, {
      currency: inputOrder.currency,
      shipToCountry: getShipToCountry(inputOrder),
    });
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
    posterQuantities: _.map(cart, item => `${_.get(item, 'quantity')}x`).join('; '),
    sizes: _.map(cart, item => _.get(item, 'customisation.size')).join('; '),
    orientations: _.map(cart, item => _.get(item, 'customisation.orientation')).join('; '),
    mapStyles: _.map(cart, item => _.get(item, 'customisation.mapStyle')).join('; '),
    posterStyles: _.map(cart, item => _.get(item, 'customisation.posterStyle')).join('; '),
    headers: _.map(cart, item => _.get(item, 'customisation.labelHeader')).join('; '),
    smallHeaders: _.map(cart, item => _.get(item, 'customisation.labelSmallHeader')).join('; '),
    texts: _.map(cart, item => _.get(item, 'customisation.labelText')).join('; '),
    coords: _.map(cart, item => mapBoundsToStr(_.get(item, 'customisation.mapBounds'))).join('; '),
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

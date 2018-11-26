const BPromise = require('bluebird');
const postmark = require('postmark');
const Mustache = require('mustache');
const _ = require('lodash');
const { oneLine } = require('common-tags');
const moment = require('moment');
const countries = require('i18n-iso-countries');
const logger = require('../util/logger')(__filename);
const { readFileSync } = require('../util');
const { calculateItemPrice, calculateCartPrice, getCurrencySymbol, getItemLabel } = require('alvarcarto-price-util');
const config = require('../config');
const { getDeliveryEstimate } = require('./printmotor-core');

const client = config.MOCK_EMAIL || config.NODE_ENV === 'test'
  ? null
  : new postmark.Client(config.POSTMARK_API_KEY);

const receiptHtmlTemplate = readFileSync('email-templates/receipt.inlined.html');
const receiptTextTemplate = readFileSync('email-templates/receipt.txt');
const deliveryStartedHtmlTemplate = readFileSync('email-templates/delivery-started.inlined.html');
const deliveryStartedTextTemplate = readFileSync('email-templates/delivery-started.txt');

function sendReceipt(order) {
  logger.logEncrypted('info', 'Sending receipt email to', order.email);

  const templateModel = createReceiptTemplateModel(order);
  return sendEmailAsync({
    From: 'help@alvarcarto.com',
    To: order.email,
    Subject: `Receipt for your purchase (#${order.orderId})`,
    TextBody: Mustache.render(receiptTextTemplate, templateModel),
    HtmlBody: Mustache.render(receiptHtmlTemplate, templateModel),
  });
}

function sendDeliveryStarted(order, trackingInfo) {
  logger.logEncrypted('info', 'Sending delivery started email to', order.email);

  const templateModel = createDeliveryStartedTemplateModel(order, trackingInfo);
  return sendEmailAsync({
    From: 'help@alvarcarto.com',
    To: order.email,
    Subject: `Your order has been shipped (#${order.orderId})`,
    TextBody: Mustache.render(deliveryStartedTextTemplate, templateModel),
    HtmlBody: Mustache.render(deliveryStartedHtmlTemplate, templateModel),
  });
}

function renderReceiptToText(order) {
  const templateModel = createReceiptTemplateModel(order);
  return Mustache.render(receiptTextTemplate, templateModel);
}

function renderReceiptToHtml(order) {
  const templateModel = createReceiptTemplateModel(order);
  return Mustache.render(receiptHtmlTemplate, templateModel);
}

function createDeliveryStartedTemplateModel(order, trackingInfo) {
  const customerName = order.differentBillingAddress
    ? _.get(order, 'billingAddress.personName', 'Poster Designer')
    : _.get(order, 'shippingAddress.personName', 'Poster Designer');

  const countryCode = _.get(order, 'shippingAddress.countryCode');
  const timeEstimate = getDeliveryEstimate(countryCode, order.cart);
  return {
    name: getFirstName(customerName),
    tracking_code: trackingInfo.code,
    tracking_url: trackingInfo.url,
    order_id: order.orderId,
    shipping_destination_description: getOrderDestinationDescription(order),
    shipping_address: getAddress(order),
    shipping_city: getCity(order),
    shipping_postal_code: getPostalCode(order),
    shipping_country: getCountry(order),
    min_delivery_business_days: timeEstimate.delivery.min,
    max_delivery_business_days: timeEstimate.delivery.max,
    support_url: 'https://alvarcarto.com/help',
    year: moment().format('YYYY'),
  };
}

function createReceiptTemplateModel(order) {
  const customerName = order.differentBillingAddress
    ? _.get(order, 'billingAddress.personName', 'Poster Designer')
    : _.get(order, 'shippingAddress.personName', 'Poster Designer');

  const totalPrice = calculateCartPrice(order.cart, {
    promotion: order.promotion,
    shipToCountry: _.get(order, 'shippingAddress.countryCode', 'FI'),
    ignorePromotionExpiry: true,
  });

  const mapCart = _.filter(order.cart, item => !item.type || item.type === 'mapPoster');
  let receiptItems = cartToReceiptItems(mapCart);

  if (order.promotion) {
    const discountCurrencySymbol = getCurrencySymbol(totalPrice.discount.currency);
    const discountHumanValue = (-totalPrice.discount.value / 100).toFixed(2);
    const discountPriceLabel = `${discountHumanValue} ${discountCurrencySymbol}`;

    receiptItems.push({
      description: `${order.promotion.label}`,
      amount: discountPriceLabel,
    });
  }

  const otherCart = _.filter(order.cart, item => item.type && item.type !== 'mapPoster');
  receiptItems = receiptItems.concat(cartToReceiptItems(otherCart));

  const countryCode = _.get(order, 'shippingAddress.countryCode');
  const timeEstimate = getDeliveryEstimate(countryCode, order.cart);

  return {
    purchase_date: order.createdAt.format('MMMM Do YYYY'),
    name: getFirstName(customerName),
    purchase_information: getPurchaseInformation(order),
    order_id: order.orderId,
    receipt_details: receiptItems,
    total: totalPrice.label,
    shipping_destination_description: getOrderDestinationDescription(order),
    shipping_address: getAddress(order),
    shipping_city: getCity(order),
    shipping_postal_code: getPostalCode(order),
    shipping_country: getCountry(order),
    web_version_url: getOrderUrl(order),
    min_delivery_business_days: timeEstimate.total.min,
    max_delivery_business_days: timeEstimate.total.max,
    support_url: 'https://alvarcarto.com/help',
    year: moment().format('YYYY'),
    vat_percentage: totalPrice.tax.taxPercentage,
    total_vat_amount: totalPrice.tax.label,
  };
}

function cartToReceiptItems(cart) {
  return _.map(cart, item => ({
    description: getItemLabel(item),
    amount: item.quantity > 1
      ? `${item.quantity}x ${getUnitPrice(item)}`
      : `${getUnitPrice(item)}`,
  }));
}

function getFirstName(fullName) {
  return _.head(fullName.split(' '));
}

function getUnitPrice(cartItem) {
  const price = calculateItemPrice(cartItem, { onlyUnitPrice: true });
  const value = (price.value / 100.0).toFixed(2);
  const symbol = getCurrencySymbol(price.currency);
  return `${value}${symbol}`;
}

function getOrderUrl(order) {
  return `https://design.alvarcarto.com/orders/${order.orderId}`;
}

function getAddress(order) {
  let address = _.get(order, 'shippingAddress.streetAddress', '');

  const extra = _.get(order, 'shippingAddress.streetAddressExtra');
  if (extra) {
    address += `, ${extra}`;
  }

  return address;
}

function getCity(order) {
  return _.get(order, 'shippingAddress.city', '');
}

function getPostalCode(order) {
  return _.get(order, 'shippingAddress.postalCode', '');
}

function getCountry(order) {
  const countryCode = _.get(order, 'shippingAddress.countryCode', '');
  let country = countryCode ? countries.getName(countryCode, 'en') : 'UNKNOWN COUNTRY';

  const state = _.get(order, 'shippingAddress.state');
  if (state) {
    country += `, ${state}`;
  }

  return country;
}

function getOrderDestinationDescription(order) {
  const countryCode = _.get(order, 'shippingAddress.countryCode', 'FI');
  if (countryCode === 'FI') {
    return 'a Matkahuolto service point near the following address';
  }

  return 'the following address';
}

function getPurchaseInformation(order) {
  if (!order.stripeChargeResponse) {
    return 'The order was free of charge.';
  }

  const creditCardBrand = _.get(order.stripeChargeResponse, 'source.brand', 'Unknown card');
  const creditCardLast4 = _.get(order.stripeChargeResponse, 'source.last4', 'XXXX');

  return oneLine`
    This purchase will appear as “${config.CREDIT_CARD_STATEMENT_NAME}”
    on your credit card statement for your ${creditCardBrand} ending in
    ${creditCardLast4}.
  `;
}

function sendEmailAsync(messageObject) {
  if (config.MOCK_EMAIL) {
    logger.info(`Mock email enabled, skipping send to ${messageObject.To} ..`);
    return BPromise.resolve();
  }

  return new BPromise((resolve, reject) => {
    client.sendEmail(messageObject, (err, result) => {
      if (err) {
        const realError = new Error(err.message);
        realError.code = err.code;
        realError.status = err.status;
        return reject(realError);
      }

      return resolve(result);
    });
  });
}

module.exports = {
  sendReceipt,
  sendDeliveryStarted,
  renderReceiptToText,
  renderReceiptToHtml,
  createReceiptTemplateModel,
  getFirstName,
  getUnitPrice,
  getOrderUrl,
  getAddress,
  getCity,
  getPostalCode,
  getCountry,
  sendEmailAsync,
};

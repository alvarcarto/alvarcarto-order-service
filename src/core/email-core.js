const BPromise = require('bluebird');
const postmark = require('postmark');
const _ = require('lodash');
const moment = require('moment');
const countries = require('i18n-iso-countries');
const logger = require('../util/logger')(__filename);
const { calculateItemPrice, calculateCartPrice, getCurrencySymbol } = require('alvarcarto-price-util');
const config = require('../config');

// This can be found from Postmark web UI
const POSTMARK_ORDER_CONFIRMATION_TEMPLATE_ID = 1488101;
const client = new postmark.Client(config.POSTMARK_API_KEY);

function mockSendOrderConfirmation(order) {
  logger.info(`Mock email enabled, skipping send to ${order.email} .. `);
  logger.logEncrypted('info', 'Order', order);
  return BPromise.resolve();
}

function sendOrderConfirmation(order) {
  const customerName = order.differentBillingAddress
    ? _.get(order, 'billingAddress.name', 'Poster Designer')
    : _.get(order, 'shippingAddress.name', 'Poster Designer');

  return sendEmailWithTemplateAsync({
    From: 'help@alvarcarto.com',
    To: order.email,
    TemplateId: POSTMARK_ORDER_CONFIRMATION_TEMPLATE_ID,
    TemplateModel: {
      purchase_date: order.createdAt.format('MMMM Do YYYY'),
      name: getFirstName(customerName),
      credit_card_statement_name: config.CREDIT_CARD_STATEMENT_NAME,
      order_id: order.orderId,
      receipt_details: _.map(order.cart, item => ({
        description: getProductName(item),
        amount: `${item.quantity}x ${getUnitPrice(item)}`,
      })),
      total: calculateCartPrice(order.cart).label,
      shipping_address: getAddress(order),
      shipping_city: getCity(order),
      shipping_postal_code: getPostalCode(order),
      shipping_country: getCountry(order),
      order_confirmation_url: getOrderUrl(order),
      support_url: 'https://alvarcarto.com/help',
      year: moment().format('YYYY'),
    },
  });
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

function getProductName(cartItem) {
  if (cartItem.labelsEnabled) {
    return `${cartItem.labelHeader}, ${cartItem.size}`;
  }

  return `Poster, ${cartItem.size}`;
}

function getOrderUrl(order) {
  return `https://design.alvarcarto.com/orders/${order.orderId}`;
}

function getAddress(order) {
  let address = _.get(order, 'shippingAddress.address', '');

  const extra = _.get(order, 'shippingAddress.addressExtra');
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
  const countryCode = _.get(order, 'shippingAddress.country', '');
  let country = countryCode ? countries.getName(countryCode, 'en') : 'UNKNOWN COUNTRY';

  const state = _.get(order, 'shippingAddress.state');
  if (state) {
    country += `, ${state}`;
  }

  return country;
}

function sendEmailWithTemplateAsync(messageObject) {
  return new BPromise((resolve, reject) => {
    client.sendEmailWithTemplate(messageObject, (err, result) => {
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
  sendOrderConfirmation: config.MOCK_EMAIL
    ? mockSendOrderConfirmation
    : sendOrderConfirmation,
};

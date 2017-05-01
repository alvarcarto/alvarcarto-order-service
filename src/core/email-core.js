const BPromise = require('bluebird');
const postmark = require('postmark');
const _ = require('lodash');
const moment = require('moment');
const countries = require('i18n-iso-countries');
const logger = require('../util/logger')(__filename);
const { calculateItemPrice, calculateCartPrice, getCurrencySymbol } = require('alvarcarto-price-util');
const config = require('../config');
const { isEuCountry } = require('./country-core');

// This can be found from Postmark web UI
const POSTMARK_RECEIPT_TEMPLATE_ID = 1488101;
const FINLAND_VAT_PERCENTAGE = 24;
const client = config.MOCK_EMAIL
  ? null
  : new postmark.Client(config.POSTMARK_API_KEY);

function mockSendReceipt(order) {
  logger.info(`Mock email enabled, skipping send to ${order.email} .. `);
  logger.logEncrypted('info', 'Order', order);
  return BPromise.resolve();
}

function sendReceipt(order) {
  logger.logEncrypted('info', 'Sending receipt email to', order.email);

  return sendEmailWithTemplateAsync({
    From: 'help@alvarcarto.com',
    To: order.email,
    TemplateId: POSTMARK_RECEIPT_TEMPLATE_ID,
    TemplateModel: createReceiptTemplateModel(order),
  });
}


function createReceiptTemplateModel(order) {
  const customerName = order.differentBillingAddress
    ? _.get(order, 'billingAddress.personName', 'Poster Designer')
    : _.get(order, 'shippingAddress.personName', 'Poster Designer');

  const vatPercentage = isEuCountry(_.get(order, 'shippingAddress.countryCode'))
    ? FINLAND_VAT_PERCENTAGE
    : 0;

  return {
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
    web_version_url: getOrderUrl(order),
    support_url: 'https://alvarcarto.com/help',
    year: moment().format('YYYY'),
    vat_percentage: vatPercentage,
    total_vat_amount: getTotalVatAmount(order.cart, vatPercentage),
  };
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

function getTotalVatAmount(cart, vatPercentage) {
  const price = calculateCartPrice(cart);
  const vatFactor = vatPercentage / 100.0;
  const vatTotal = ((price.value * vatFactor) / 100.0).toFixed(2);
  const symbol = getCurrencySymbol(price.currency);
  return `${vatTotal}${symbol}`;
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
  sendReceipt: config.MOCK_EMAIL
    ? mockSendReceipt
    : sendReceipt,
};

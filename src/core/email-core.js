const BPromise = require('bluebird');
const postmark = require('postmark');
const Mustache = require('mustache');
const _ = require('lodash');
const moment = require('moment');
const countries = require('i18n-iso-countries');
const logger = require('../util/logger')(__filename);
const { readFileSync } = require('../util');
const { calculateItemPrice, calculateCartPrice, getCurrencySymbol } = require('alvarcarto-price-util');
const config = require('../config');
const { isEuCountry } = require('./country-core');

// This can be found from Postmark web UI
const FINLAND_VAT_PERCENTAGE = 24;
const client = new postmark.Client(config.POSTMARK_API_KEY);

const receiptHtmlTemplate = readFileSync('email-templates/receipt.inlined.html');
const receiptTextTemplate = readFileSync('email-templates/receipt.txt');

function mockSendReceipt(order) {
  logger.info(`Mock email enabled, skipping send to ${order.email} .. `);
  logger.logEncrypted('info', 'Order', order);
  return BPromise.resolve();
}

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

function renderReceiptToText(order) {
  const templateModel = createReceiptTemplateModel(order);
  return Mustache.render(receiptTextTemplate, templateModel);
}

function renderReceiptToHtml(order) {
  const templateModel = createReceiptTemplateModel(order);
  return Mustache.render(receiptHtmlTemplate, templateModel);
}

function createReceiptTemplateModel(order) {
  const customerName = order.differentBillingAddress
    ? _.get(order, 'billingAddress.personName', 'Poster Designer')
    : _.get(order, 'shippingAddress.personName', 'Poster Designer');

  const vatPercentage = isEuCountry(_.get(order, 'shippingAddress.countryCode'))
    ? FINLAND_VAT_PERCENTAGE
    : 0;

  const totalPrice = calculateCartPrice(order.cart, order.promotion, {
    ignorePromotionExpiry: true,
  });
  const receiptItems = _.map(order.cart, item => ({
    description: getProductName(item),
    amount: `${item.quantity}x ${getUnitPrice(item)}`,
  }));

  receiptItems.push({ description: 'Shipping', amount: '0.00 €'});
  if (order.promotion) {
    receiptItems.push({
      description: `Promotion ${order.promotion.label}`,
      amount: `-${totalPrice.discount.label}`,
    });
  }

  return {
    purchase_date: order.createdAt.format('MMMM Do YYYY'),
    name: getFirstName(customerName),
    credit_card_statement_name: config.CREDIT_CARD_STATEMENT_NAME,
    credit_card_brand: _.get(order.stripeChargeResponse, 'source.brand', 'Unknown'),
    credit_card_last4: _.get(order.stripeChargeResponse, 'source.last4', 'XXXX'),
    order_id: order.orderId,
    receipt_details: receiptItems,
    total: totalPrice.label,
    shipping_address: getAddress(order),
    shipping_city: getCity(order),
    shipping_postal_code: getPostalCode(order),
    shipping_country: getCountry(order),
    web_version_url: getOrderUrl(order),
    support_url: 'https://alvarcarto.com/help',
    year: moment().format('YYYY'),
    vat_percentage: vatPercentage,
    total_vat_amount: getTotalVatAmount(totalPrice, vatPercentage),
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

function getTotalVatAmount(totalPrice, vatPercentage) {
  const vatFactor = vatPercentage / 100.0;
  const vatTotal = ((totalPrice.value * vatFactor) / 100.0).toFixed(2);
  const symbol = getCurrencySymbol(totalPrice.currency);
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

function sendEmailAsync(messageObject) {
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
  sendReceipt: config.MOCK_EMAIL
    ? mockSendReceipt
    : sendReceipt,
  renderReceiptToText,
  renderReceiptToHtml,
  createReceiptTemplateModel,
};

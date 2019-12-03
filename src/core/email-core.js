const BPromise = require('bluebird');
const postmark = require('postmark');
const Mustache = require('mustache');
const { stripIndent } = require('common-tags');
const _ = require('lodash');
const countries = require('i18n-iso-countries');
const { oneLine } = require('common-tags');
const { calculateItemPrice, calculateCartPrice, getProduct } = require('alvarcarto-price-util');
const moment = require('../util/moment').momentTimezone;
const logger = require('../util/logger')(__filename);
const {
  readFileSync,
  getShipToCountry,
  filterMapPosterCart,
  filterOtherItemsCart,
} = require('../util');
const PAYMENT_PROVIDER = require('../enums/payment-provider');
const PAYMENT_PROVIDER_METHOD = require('../enums/payment-provider-method');
const config = require('../config');
const { getDeliveryEstimate } = require('./printmotor-core');
const orderCore = require('./order-core');
const { diffInWorkingDays } = require('../util/time');

const client = config.MOCK_EMAIL || config.NODE_ENV === 'test'
  ? null
  : new postmark.Client(config.POSTMARK_API_KEY);

const receiptHtmlTemplate = readFileSync('email-templates/receipt.inlined.html');
const receiptTextTemplate = readFileSync('email-templates/receipt.txt');
const deliveryStartedHtmlTemplate = readFileSync('email-templates/delivery-started.inlined.html');
const deliveryUpdateHtmlTemplate = readFileSync('email-templates/delivery-update.inlined.html');
const deliveryStartedTextTemplate = readFileSync('email-templates/delivery-started.txt');
const deliveryLateHtmlTemplate = readFileSync('email-templates/delivery-late.inlined.html');
const deliveryLateTextTemplate = readFileSync('email-templates/delivery-late.txt');
const deliveryReminderToPrintmotorTextTemplate = readFileSync('email-templates/delivery-reminder-to-printmotor.txt');

// http://stackoverflow.com/questions/42262887/enabling-brand-icon-in-cardnumber-type-element-in-stripe
const CARD_TYPE_TO_LABEL = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diner\'s',
  jcb: 'JCB',
  unknown: 'Unknown',
};

function sendReceipt(order) {
  logger.logEncrypted('info', 'Sending receipt email to', order.email);

  const templateModel = createReceiptTemplateModel(order);
  const messageObject = {
    From: 'help@alvarcarto.com',
    To: order.email,
    Subject: `Receipt for your purchase (#${order.orderId})`,
    TextBody: Mustache.render(receiptTextTemplate, templateModel),
    HtmlBody: Mustache.render(receiptHtmlTemplate, templateModel),
  };
  return sendEmailAsync(messageObject)
    .tap(response => saveEmailEvent('receipt', [order], messageObject, response));
}

function sendDeliveryStarted(order, trackingInfo) {
  logger.logEncrypted('info', 'Sending delivery started email to', order.email);

  const templateModel = createDeliveryStartedTemplateModel(order, trackingInfo);
  const messageObject = {
    From: 'help@alvarcarto.com',
    To: order.email,
    Subject: `Your order has been shipped (#${order.orderId})`,
    TextBody: Mustache.render(deliveryStartedTextTemplate, templateModel),
    HtmlBody: Mustache.render(deliveryStartedHtmlTemplate, templateModel),
  };
  return sendEmailAsync(messageObject)
    .tap(response => saveEmailEvent('delivery-started', [order], messageObject, response));
}

function sendDeliveryUpdate(order, trackingInfo) {
  logger.logEncrypted('info', 'Sending delivery started email to', order.email);

  const templateModel = createDeliveryStartedTemplateModel(order, trackingInfo);
  const messageObject = {
    From: 'help@alvarcarto.com',
    To: order.email,
    Subject: `Update to your order's shipping details (#${order.orderId})`,
    HtmlBody: Mustache.render(deliveryUpdateHtmlTemplate, templateModel),
  };
  return sendEmailAsync(messageObject)
    .tap(response => saveEmailEvent('delivery-update', [order], messageObject, response));
}

function sendDeliveryReminderToPrintmotor(lateOrders) {
  logger.info(`Sending delivery reminder email to ${config.PRINTMOTOR_SUPPORT_EMAIL}`);

  const templateModel = createDeliveryReminderToPrintmotorTemplateModel(lateOrders);
  const messageObject = {
    From: 'help@alvarcarto.com',
    To: config.PRINTMOTOR_SUPPORT_EMAIL,
    Cc: 'help@alvarcarto.com',
    Subject: lateOrders.length > 1
      ? `Status of orders (at ${moment().format('MMMM Do YYYY')})`
      : `Status of order #${lateOrders[0].orderId}`,
    TextBody: Mustache.render(deliveryReminderToPrintmotorTextTemplate, templateModel),
  };
  return sendEmailAsync(messageObject)
    .tap(response => saveEmailEvent('delivery-reminder-to-printmotor', lateOrders, messageObject, response));
}

function sendDeliveryLate(order) {
  logger.logEncrypted('info', 'Sending order delayed email to', order.email);

  const customerName = getBuyerCustomerName(order);
  const templateModel = {
    order_id: order.orderId,
    name: getFirstName(customerName),
    support_url: 'https://alvarcarto.com/help',
    year: moment().format('YYYY'),
  };
  const messageObject = {
    From: 'help@alvarcarto.com',
    To: 'kimmo.brunfeldt@alvarcarto.com',
    Subject: 'Your order production has taken longer than average',
    TextBody: Mustache.render(deliveryLateTextTemplate, templateModel),
    HtmlBody: Mustache.render(deliveryLateHtmlTemplate, templateModel),
  };
  return sendEmailAsync(messageObject)
    .tap(response => saveEmailEvent('delivery-late', [order], messageObject, response));
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
  const customerName = getBuyerCustomerName(order);
  const countryCode = getShipToCountry(order);
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

function createDeliveryReminderToPrintmotorTemplateModel(lateOrders) {
  if (lateOrders.length < 1) {
    throw new Error('Can\'t send email when lateOrders is empty');
  }

  return {
    orders: _.map(lateOrders, (order) => {
      return {
        order_id: order.orderId,
        business_days_after_order: Math.floor(diffInWorkingDays(moment(), moment(order.createdAt))),
        // XXX: Assumption: Printmotor is in this timezone
        pretty_order_timestamp: moment(order.createdAt)
          .locale('en')
          .tz('Europe/Helsinki')
          .calendar(),
        receiver_customer_info: `${getReceiverCustomerName(order)}, ${getCity(order)}`,
      };
    }),
    only_one_order: lateOrders.length === 1,
  };
}

function createReceiptTemplateModel(order) {
  const totalPrice = calculateCartPrice(order.cart, {
    promotion: order.promotion,
    shipToCountry: getShipToCountry(order),
    currency: order.currency,
    ignorePromotionExpiry: true,
  });

  const mapCart = filterMapPosterCart(order.cart);
  let receiptItems = cartToReceiptItems(mapCart, order.currency);

  if (order.promotion) {
    receiptItems.push({
      description: order.promotion.label,
      amount: `-${totalPrice.discount.label}`,
    });
  }

  const otherCart = filterOtherItemsCart(order.cart);
  receiptItems = receiptItems.concat(cartToReceiptItems(otherCart));
  const customerName = getBuyerCustomerName(order);
  const deliveryText = getDeliveryInfoTextForReceipt(order);

  return {
    purchase_date: order.createdAt.format('MMMM Do YYYY'),
    delivery_info_text: deliveryText,
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
    support_url: 'https://alvarcarto.com/help',
    year: moment().format('YYYY'),
    receipt_taxes: taxesToReceiptItems(totalPrice.taxes),
  };
}

function cartToReceiptItems(cart, currency) {
  return _.map(cart, item => ({
    description: getProduct(item.sku).name,
    amount: item.quantity > 1
      ? `${item.quantity}x ${getUnitPriceLabel(item, currency)}`
      : `${getUnitPriceLabel(item, currency)}`,
  }));
}

function taxesToReceiptItems(taxes) {
  return _.map(taxes, tax => ({
    vat_percentage: tax.taxPercentage,
    amount: tax.label,
  }));
}

function getBuyerCustomerName(order) {
  if (order.differentBillingAddress) {
    return _.get(order, 'billingAddress.personName', 'Poster Designer');
  }

  return _.get(order, 'shippingAddress.personName', 'Poster Designer');
}

function getReceiverCustomerName(order) {
  return _.get(order, 'shippingAddress.personName', 'Poster Designer');
}

function getDeliveryInfoTextForReceipt(order) {
  const countryCode = getShipToCountry(order);
  if (!countryCode) {
    return 'You should receive the digital items soon.';
  }

  const timeEstimate = getDeliveryEstimate(countryCode, order.cart);
  return stripIndent`
    The posters will be printed and shipped soon, we'll keep you up to date via email.
    In our estimation, you should get the posters in ${timeEstimate.total.min} -
    ${timeEstimate.total.max} business days.
  `;
}

function getFirstName(fullName) {
  return _.head(fullName.split(' '));
}

function getUnitPriceLabel(cartItem, currency) {
  const price = calculateItemPrice(cartItem, { currency, onlyUnitPrice: true });
  return price.label;
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
  if (countryCode === 'FI' || countryCode === 'AX') {
    return 'a Matkahuolto service point near the following address';
  }

  return 'the following address';
}

function isOrderFree(order) {
  const paymentProviders = _.map(order.payments, p => p.paymentProvider);
  return _.every(
    paymentProviders,
    p => p === PAYMENT_PROVIDER.GIFTCARD || p === PAYMENT_PROVIDER.PROMOTION,
  );
}

function paymentMethodDetailsToDescription(paymentMethodDetails) {
  if (paymentMethodDetails.type !== 'card') {
    throw new Error(`Unknown payment method type: ${paymentMethodDetails.type}`);
  }

  const brand = _.get(paymentMethodDetails, 'card.brand', 'Unknown brand');
  const last4 = _.get(paymentMethodDetails, 'card.last4', 'XXXX');
  return `${CARD_TYPE_TO_LABEL[brand]} credit card ending in ${last4}`;
}

function getPaymentMethodDescription(order) {
  const payment = _.find(order.payments, p => p.paymentProvider === PAYMENT_PROVIDER.STRIPE);

  let paymentMethodDetails;
  if (payment.paymentProviderMethod === PAYMENT_PROVIDER_METHOD.STRIPE_CHARGE) {
    paymentMethodDetails = _.get(payment.stripeChargeResponse, 'payment_method_details');
  } else if (payment.paymentProviderMethod === PAYMENT_PROVIDER_METHOD.STRIPE_PAYMENT_INTENT) {
    const charges = _.get(payment.stripeEvent, 'data.object.charges.data');
    const charge = _.find(charges, c => c.status === 'succeeded');
    paymentMethodDetails = _.get(charge, 'payment_method_details');
  } else {
    throw new Error(`Unknown payment provider method: ${payment.paymentProviderMethod}`);
  }

  return paymentMethodDetailsToDescription(paymentMethodDetails);
}

function getPurchaseInformation(order) {
  if (isOrderFree(order)) {
    return 'The order was free of charge.';
  }

  const paymentMethodDescription = getPaymentMethodDescription(order);

  return oneLine`
    The purchase was completed with your ${paymentMethodDescription}.
    The transaction will appear as “${config.CREDIT_CARD_STATEMENT_NAME}” on your statement.
  `;
}

function saveEmailEvent(type, orders, messageObject, postmarkResponse) {
  if (config.MOCK_EMAIL) {
    logger.info('Mock email enabled, not saving email event.');
    return BPromise.resolve();
  }

  return BPromise.mapSeries(orders, (order) => {
    return orderCore.addEmailSent(order.orderId, {
      type,
      emailId: postmarkResponse.MessageID,
      to: messageObject.To,
      cc: messageObject.Cc,
      subject: messageObject.Subject,
    });
  })
    .catch((err) => {
      logger.error('alert-normal Failed to save email events to database');
      logger.error(`Message was type ${type}`);
      logger.error(`Orders: ${_.map(orders, o => o.orderId).join(', ')}`);
      throw err;
    });
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
  sendDeliveryUpdate,
  sendDeliveryReminderToPrintmotor,
  sendDeliveryLate,
  renderReceiptToText,
  renderReceiptToHtml,
  createReceiptTemplateModel,
  sendEmailAsync,
};

const util = require('util');
const _ = require('lodash');
const { calculateCartPrice } = require('alvarcarto-price-util');
const { knex } = require('../util/database');
const ORDER_EVENT_SOURCE = require('../enums/order-event-source');
const PAYMENT_TYPE = require('../enums/payment-type');
const PAYMENT_PROVIDER = require('../enums/payment-provider');
const PAYMENT_PROVIDER_METHOD = require('../enums/payment-provider-method');
const { getShipToCountry } = require('../util');
const logger = require('../util/logger')(__filename);
const orderCore = require('./order-core');
const emailCore = require('./email-core');
const config = require('../config');

async function saveStripeEvent(event) {
  const stripeObj = event.data.object;
  const { prettyOrderId } = stripeObj.metadata;

  if (!prettyOrderId) {
    logger.logEncrypted(
      'error',
      'alert-critical Received an event from stripe without pretty order id in the metadata!',
      event,
    );
    throw new Error('Received an event from stripe without pretty order id in the metadata!');
  }

  await orderCore.createOrderEvent(prettyOrderId, {
    source: ORDER_EVENT_SOURCE.STRIPE,
    event: event.type,
    payload: event,
  });
}

async function processPaymentIntentSucceeded(event) {
  const intent = event.data.object;
  const { prettyOrderId } = intent.metadata;

  logger.info(`Succeeded payment intent: ${intent.id} (${prettyOrderId})`);

  const order = await orderCore.getOrder(prettyOrderId, { allFields: true });
  const { promotion } = order;
  const shipToCountry = getShipToCountry(order);
  const originalPrice = calculateCartPrice(order.cart, { currency: order.currency, shipToCountry });
  const discountPrice = calculateCartPrice(order.cart, {
    currency: order.currency,
    promotion,
    shipToCountry,
  });

  await knex.transaction(async (trx) => {
    if (promotion) {
      const amountPaidWithPromotion = originalPrice.value - discountPrice.value;
      const paymentProvider = promotion.paymentProvider === 'GIFTCARD'
        ? PAYMENT_PROVIDER.GIFTCARD
        : PAYMENT_PROVIDER.PROMOTION;

      await orderCore.createPayment(prettyOrderId, {
        type: PAYMENT_TYPE.CHARGE,
        paymentProvider,
        amount: amountPaidWithPromotion,
        // We use intent currency here, since percentage promotions can be used
        // with multiple currencies. order.currency should be the same as the intent currency
        currency: intent.currency.toUpperCase(),
        promotionCode: promotion.promotionCode,
      }, { trx });
    }

    if (intent.amount_received !== discountPrice.value) {
      logger.error('alert-business-critical The payment intent has different amount than calculated cart price!');
      logger.error(`Intent amount received ${util.inspect(intent.amount_received)}, cart price: ${util.inspect(discountPrice.value)}`);
      throw new Error('The payment intent has different amount than calculated cart price');
    }

    if (intent.currency.toUpperCase() !== order.currency.toUpperCase()) {
      const diff = `intent: ${intent.currency.toUpperCase()}, order: ${order.currency.toUpperCase()}`;
      logger.error(`alert-business-critical Payment intent and order had different currencies, ${diff}`);
      throw new Error('The payment intent has different currency than the order');
    }

    await orderCore.createPayment(prettyOrderId, {
      type: PAYMENT_TYPE.CHARGE,
      paymentProvider: PAYMENT_PROVIDER.STRIPE,
      paymentProviderMethod: PAYMENT_PROVIDER_METHOD.STRIPE_PAYMENT_INTENT,
      amount: intent.amount_received,
      currency: intent.currency.toUpperCase(),
      stripePaymentIntentId: intent.id,
      stripeEvent: event,
    }, { trx });
  });

  const updatedOrder = await orderCore.getOrder(prettyOrderId, { allFields: true });
  await emailCore.sendReceipt(updatedOrder);
}

async function processChargeRefunded(event) {
  const charge = event.data.object;
  const { prettyOrderId } = charge.metadata;
  logger.info(`Refund is related to charge: ${charge.id} (${prettyOrderId})`);

  await knex.transaction(async (trx) => {
    if (charge.refunds.has_more) {
      logger.error('Refunds:', charge.refunds);
      throw new Error('All refunds are not in the list, pagination support is needed!');
    }

    const succeededRefunds = _.filter(charge.refunds.data, r => r.status === 'succeeded');
    const refund = _.last(_.sortBy(succeededRefunds, 'created'));

    await orderCore.createPayment(prettyOrderId, {
      type: PAYMENT_TYPE.REFUND,
      paymentProvider: PAYMENT_PROVIDER.STRIPE,
      paymentProviderMethod: charge.payment_intent
        ? PAYMENT_PROVIDER_METHOD.STRIPE_PAYMENT_INTENT
        : PAYMENT_PROVIDER_METHOD.STRIPE_CHARGE,
      amount: refund.amount,
      currency: refund.currency.toUpperCase(),
      stripePaymentIntentId: charge.payment_intent,
      stripeEvent: event,
    }, { trx });
  });

  // TODO: Send refund receipt
}

async function processPaymentIntentFailed(event) {
  const intent = event.data.object;
  const message = _.get(intent, 'last_payment_error.message');
  logger.info(`Warning! Failed payment intent: ${intent.id} with message "${message}"`);
}

async function processPaymentIntentCanceled(event) {
  const intent = event.data.object;
  const message = _.get(intent, 'cancellation_reason');
  logger.info(`Warning! Canceled payment intent: ${intent.id} with reason: "${message}"`);
}

async function processOtherPaymentIntent(event) {
  logger.info(`Received other payment intent event: ${event.type}`);
}

async function processStripeEvent(event) {
  if (!event.livemode && config.STRIPE_ALLOW_TEST_WEBHOOK_EVENTS) {
    logger.warn('Warning: test event received, STRIPE_ALLOW_TEST_WEBHOOK_EVENTS=true so processing ..');
  } else if (!event.livemode && !config.STRIPE_ALLOW_TEST_WEBHOOK_EVENTS) {
    logger.warn('Warning: Test event received, will not do anything.');
    return;
  }

  if (_.startsWith(event.type, 'payment_intent') || event.type === 'charge.refunded') {
    await saveStripeEvent(event);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      await processPaymentIntentSucceeded(event);
      return;
    case 'payment_intent.payment_failed':
      await processPaymentIntentFailed(event);
      return;
    case 'payment_intent.canceled':
      await processPaymentIntentCanceled(event);
      return;
    case 'charge.refunded':
      await processChargeRefunded(event);
      return;
    case 'payment_intent.created':
    case 'payment_intent.amount_capturable_updated':
      await processOtherPaymentIntent(event);
      return;
    default:
      logger.info(`${event.type} stripe event received, will not do anything`);
  }
}

module.exports = {
  processStripeEvent,
};

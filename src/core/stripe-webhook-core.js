const util = require('util');
const _ = require('lodash');
const { calculateCartPrice } = require('alvarcarto-price-util');
const { knex } = require('../util/database');
const ORDER_EVENT_SOURCE = require('../enums/order-event-source');
const PAYMENT_TYPE = require('../enums/payment-type');
const PAYMENT_PROVIDER = require('../enums/payment-provider');
const PAYMENT_PROVIDER_METHOD = require('../enums/payment-provider-method');
const logger = require('../util/logger')(__filename);
const orderCore = require('./order-core');
const emailCore = require('./email-core');
const config = require('../config');

async function savePaymentIntentEvent(event) {
  const intent = event.data.object;
  const { prettyOrderId } = intent.metadata;

  await orderCore.createOrderEvent(prettyOrderId, {
    source: ORDER_EVENT_SOURCE.STRIPE,
    event: event.type,
    payload: event,
  });
}

async function processPaymentSucceeded(event) {
  const intent = event.data.object;
  logger.info(`Succeeded payment intent: ${intent.id}`);

  const { prettyOrderId } = intent.metadata;
  const order = await orderCore.getOrder(prettyOrderId, { allFields: true });
  const { promotion } = order;
  const originalPrice = calculateCartPrice(order.cart);
  const discountPrice = calculateCartPrice(order.cart, { promotion });

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
        currency: promotion.currency.toUpperCase(),
        promotionCode: promotion.promotionCode,
      }, { trx });
    }

    if (intent.amount_received !== discountPrice.value) {
      logger.error('alert-business-critical The payment intent has different amount than calculated cart price!');
      logger.error(`Intent amount received ${util.inspect(intent.amount_received)}, cart price: ${util.inspect(discountPrice.value)}`);
      throw new Error('The payment intent has different amount than calculated cart price');
    }

    await orderCore.createPayment(prettyOrderId, {
      type: PAYMENT_TYPE.CHARGE,
      paymentProvider: PAYMENT_PROVIDER.STRIPE,
      paymentProviderMethod: PAYMENT_PROVIDER_METHOD.STRIPE_PAYMENT_INTENT,
      amount: intent.amount_received,
      currency: intent.currency.toUpperCase(),
      stripePaymentIntentId: intent.id,
      stripePaymentIntentSuccessEvent: event,
    }, { trx });
  });

  const updatedOrder = await orderCore.getOrder(prettyOrderId, { allFields: true });
  await emailCore.sendReceipt(updatedOrder);
}

async function processPaymentFailed(event) {
  const intent = event.data.object;
  const message = _.get(intent, 'last_payment_error.message');
  logger.info(`Warning! Failed payment intent: ${intent.id} with message "${message}"`);
}

async function processPaymentCanceled(event) {
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
    logger.warn('Test event received, will not do anything.');
    return;
  }

  if (_.startsWith(event.type, 'payment_intent')) {
    await savePaymentIntentEvent(event);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      await processPaymentSucceeded(event);
      return;
    case 'payment_intent.payment_failed':
      await processPaymentFailed(event);
      return;
    case 'payment_intent.canceled':
      await processPaymentCanceled(event);
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

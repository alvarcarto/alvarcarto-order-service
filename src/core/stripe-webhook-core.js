const crypto = require('crypto');
const BPromise = require('bluebird');
const _ = require('lodash');
const { knex } = require('../util/database');
const logger = require('../util/logger')(__filename);
const orderCore = require('./order-core');
const emailCore = require('./email-core');
const config = require('../config');

function processPaymentSucceeded(event) {
  const intent = event.data.object;
  logger.info(`Succeeded payment intent: ${intent.id}`);

}

function processPaymentFailed(event) {
  const intent = event.data.object;
  const message = _.get(intent, 'last_payment_error.message');
  logger.info(`Warning! Failed payment intent: ${intent.id} with message "${message}"`);

}

async function processStripeEvent(event) {
  if (!event.livemode && config.STRIPE_ALLOW_TEST_WEBHOOK_EVENTS) {
    logger.warn('Warning: test event received, STRIPE_ALLOW_TEST_WEBHOOK_EVENTS=true so processing ..');
  } else if (!event.livemode && !config.STRIPE_ALLOW_TEST_WEBHOOK_EVENTS) {
    logger.warn('Test event received, will not do anything.');
    return;
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      await processPaymentSucceeded(event);
      return;
    case 'payment_intent.payment_failed':
      await processPaymentFailed(event);
      return;
    default:
      logger.info(`${event.type} stripe event received, will not do anything`);
  }
}

module.exports = {
  processStripeEvent,
};

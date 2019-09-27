const _ = require('lodash');
const ex = require('../util/express');
const config = require('../config');
const stripe = require('../util/stripe');
const logger = require('../util/logger')(__filename);
const printmotorWebhookCore = require('../core/printmotor-webhook-core');
const stripeWebhookCore = require('../core/stripe-webhook-core')

const { stripeInstance } = stripe;

const postPrintmotor = ex.createJsonRoute((req) => {
  logger.logEncrypted('info', 'Webhook called:', req.body);

  const incomingHmac = req.headers['x-printmotor-hmac-sha256'];
  return printmotorWebhookCore.savePrintmotorEvent(req.body, incomingHmac)
    .then(() => ({ status: 'OK' }));
});

const postOneflow = ex.createJsonRoute((req) => {
  logger.info('Oneflow webhook called:', req.body);
  logger.info('Headers:', req.headers);
});

const postStripe = ex.createJsonRoute(async (req) => {
  const ipAddresses = await stripe.getWebhookIpAddresses();
  const isFromSafeSource = _.includes(ipAddresses, req.ip) || config.ALLOW_UNVERIFIED_WEBHOOKS;
  if (!isFromSafeSource) {
    ex.throwStatus(403, 'Only verified sources are allowed');
  }

  let event;
  // Stripe CLI will trigger local events with correct signature, so there's no need to create
  // an exception for ALLOW_UNVERIFIED_WEBHOOKS env var in the signature verification
  try {
    event = stripeInstance.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      config.STRIPE_WEBHOOK_SECRET,
    );
  } catch (e) {
    ex.throwStatus(401, 'Unable to verify webhook signature');
  }

  await stripeWebhookCore.processStripeEvent(event);

  return { status: 'OK' };
});

module.exports = {
  postPrintmotor,
  postOneflow,
  postStripe,
};

const _ = require('lodash');
const ex = require('../util/express');
const config = require('../config');
const stripe = require('../util/stripe');
const logger = require('../util/logger')(__filename);
const webhookCore = require('../core/webhook-core');

const { stripeInstance } = stripe;

const postPrintmotor = ex.createJsonRoute((req) => {
  logger.logEncrypted('info', 'Webhook called:', req.body);

  const incomingHmac = req.headers['x-printmotor-hmac-sha256'];
  return webhookCore.savePrintmotorEvent(req.body, incomingHmac)
    .then(() => ({ status: 'OK' }));
});

const postOneflow = ex.createJsonRoute((req) => {
  logger.info('Oneflow webhook called:', req.body);
  logger.info('Headers:', req.headers);
});

const postStripe = ex.createJsonRoute(async (req) => {
  logger.info('Stripe webhook called:', req.body);
  logger.info('Headers:', req.headers);

  const ipAddresses = await stripe.getWebhookIpAddresses();
  const isFromSafeSource = _.includes(ipAddresses, req.ip) || config.ALLOW_UNVERIFIED_WEBHOOKS;
  if (!isFromSafeSource) {
    ex.throwStatus(403, 'Only verified sources are allowed');
  }

  const signature = req.headers['stripe-signature'];
  logger.info('signature', signature)
  logger.info('secret', config.STRIPE_WEBHOOK_SECRET)
  const event = stripeInstance.webhooks.constructEvent(req.body, signature, config.STRIPE_WEBHOOK_SECRET);
  logger.info('Stripe event:', event);

  return { status: 'OK' };
});

module.exports = {
  postPrintmotor,
  postOneflow,
  postStripe,
};

const Stripe = require('stripe');
const request = require('request-promise');
const config = require('../config');

const cache = {
  allowedWebhookIpAddresses: [],
};

async function getWebhookIpAddresses() {
  if (cache.allowedWebhookIpAddresses.length === 0) {
    const data = await request('https://stripe.com/files/ips/ips_webhooks.json', { json: true });
    cache.allowedWebhookIpAddresses = data.WEBHOOKS;
  }

  return cache.allowedWebhookIpAddresses;
}

const stripeInstance = Stripe(config.STRIPE_SECRET_KEY);
stripeInstance.setApiVersion(config.STRIPE_API_VERSION);

module.exports = {
  stripeInstance,
  getWebhookIpAddresses,
};

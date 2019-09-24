const Stripe = require('stripe');
const request = require('request-promise');
const config = require('../config');

const cache = {
  allowedWebhookIpAddresses: [],
};

async function getWebhookIpAddresses() {
  if (cache.allowedWebhookIpAddresses.length === 0) {
    const data = await request('https://stripe.com/files/ips/ips_webhooks.json');
    cache.allowedWebhookIpAddresses = data.WEBHOOKS;
  }

  return cache.allowedWebhookIpAddresses;
}

module.exports = {
  stripeInstance: Stripe(config.STRIPE_SECRET_KEY),
  getWebhookIpAddresses,
};

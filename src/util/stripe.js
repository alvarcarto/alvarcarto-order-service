const Stripe = require('stripe');
const config = require('../config');

module.exports = Stripe(config.STRIPE_SECRET_KEY);

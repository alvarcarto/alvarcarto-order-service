const Joi = require('joi');
const validate = require('express-validation');
const RateLimit = require('express-rate-limit');
const express = require('express');
const order = require('./http/order-http');
const health = require('./http/health-http');

const {
  addressSchema,
  stripeCreateTokenResponseSchema,
  printmotorWebhookPayload,
  cartSchema,
} = require('./util/validation');

function createRouter() {
  const router = express.Router();
  router.get('/api/health', health.getHealth);

  const postOrderSchema = {
    body: {
      email: Joi.string().email().required(),
      differentBillingAddress: Joi.boolean().optional(),
      emailSubscription: Joi.boolean().optional(),
      shippingAddress: addressSchema.required(),
      billingAddress: addressSchema.optional(),
      stripeTokenResponse: stripeCreateTokenResponseSchema.required(),
      cart: cartSchema.required(),
    },
  };
  router.post('/api/orders', validate(postOrderSchema), order.postOrder);

  // Uses req.ip as the default identifier
  const apiLimiter = new RateLimit({
    windowMs: 10 * 60 * 1000,
    max: 50,
    delayMs: 0,
  });

  const getOrderSchema = {
    params: {
      orderId: Joi.string().regex(/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$/).required(),
    },
  };
  router.get('/api/orders/:orderId', apiLimiter, validate(getOrderSchema), order.getOrder);

  const postWebHook = {
    body: printmotorWebhookPayload,
  };
  router.post('/api/webhooks/printmotor', validate(postWebHook), order.postWebhook);

  return router;
}

module.exports = createRouter;

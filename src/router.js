const Joi = require('joi');
const validate = require('express-validation');
const RateLimit = require('express-rate-limit');
const express = require('express');
const order = require('./http/order-http');

const {
  addressSchema,
  stripeCreateTokenResponseSchema,
  cartSchema,
} = require('./util/validation');

function createRouter() {
  const router = express.Router();
  const postOrderSchema = {
    body: {
      email: Joi.string().email().required(),
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
    // num of connections during windowMs before starting to delay responses.
    delayAfter: 25,
    delayMs: 3000,
  });

  const getOrderSchema = {
    params: {
      orderId: Joi.string().required(),
    },
  };
  router.get('/api/orders/:orderId', apiLimiter, validate(getOrderSchema), order.getOrder);

  return router;
}

module.exports = createRouter;

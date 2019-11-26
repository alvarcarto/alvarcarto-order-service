const _ = require('lodash');
const Joi = require('joi');
const bodyParser = require('body-parser');
const validate = require('express-validation');
const RateLimit = require('express-rate-limit');
const express = require('express');
const ROLES = require('./enums/role');
const order = require('./http/order-http');
const product = require('./http/product-http');
const health = require('./http/health-http');
const receipt = require('./http/receipt-http');
const webhook = require('./http/webhook-http');
const promotion = require('./http/promotion-http');
const {
  printmotorWebhookPayloadSchema,
  orderSchema,
  orderIdSchema,
  promotionSchema,
  promotionCodeSchema,
  latLngSchema,
} = require('./validation');

function _requireRole(role) {
  return function middleware(req, res, next) {
    if (_.get(req, 'user.role') !== role) {
      const err = new Error('Unauthorized');
      err.status = 401;
      return next(err);
    }

    return next();
  };
}

function createJsonRouter() {
  const router = express.Router();
  router.get('/api/health', health.getHealth);


  // Uses req.ip as the default identifier
  const createOrderApiLimiter = new RateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    delayMs: 0,
  });

  const postOrderSchema = {
    body: orderSchema,
  };
  router.post(
    '/api/orders',
    createOrderApiLimiter,
    validate(postOrderSchema),
    order.postOrder,
  );

  // Uses req.ip as the default identifier
  const apiLimiter = new RateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    delayMs: 0,
  });

  const getOrderSchema = {
    params: {
      orderId: Joi.string().regex(/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$/).required(),
    },
  };
  router.get('/api/orders/:orderId', apiLimiter, validate(getOrderSchema), order.getOrder);

  router.get('/api/promotions', _requireRole(ROLES.ADMIN), promotion.getPromotions);
  const postPromotionSchema = {
    options: { allowUnknownBody: false },
    body: promotionSchema,
  };
  router.post('/api/promotions', validate(postPromotionSchema), _requireRole(ROLES.ADMIN), promotion.postPromotion);
  const getPromotionSchema = {
    params: {
      promotionCode: promotionCodeSchema,
    },
  };
  router.get(
    '/api/promotions/:promotionCode',
    apiLimiter,
    validate(getPromotionSchema),
    promotion.getPromotion,
  );

  router.get('/api/currentPromotion', promotion.getCurrentPromotion);

  const postWebhookPrintmotor = {
    body: printmotorWebhookPayloadSchema,
  };
  router.post('/api/webhooks/printmotor', validate(postWebhookPrintmotor), webhook.postPrintmotor);

  // TODO: Add validation
  router.post('/api/webhooks/oneflow', webhook.postOneflow);

  const getCities = {
    query: latLngSchema,
  };
  router.get('/api/cities', validate(getCities), product.getCities);

  const getReceiptForOrder = {
    params: {
      orderId: orderIdSchema.required(),
    },
  };
  router.get(
    '/views/receipts/:orderId',
    validate(getReceiptForOrder),
    _requireRole(ROLES.ADMIN),
    receipt.getReceipt,
  );
  return router;
}

function createRawRouter() {
  const router = express.Router();
  router.post('/api/webhooks/stripe', bodyParser.raw({ type: 'application/json' }), webhook.postStripe);
  return router;
}

module.exports = {
  createJsonRouter,
  createRawRouter,
};

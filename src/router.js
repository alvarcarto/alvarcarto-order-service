const _ = require('lodash');
const Joi = require('joi');
const validate = require('express-validation');
const RateLimit = require('express-rate-limit');
const express = require('express');
const config = require('./config');
const ROLES = require('./enums/roles');
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
  promotionCodeSchema,
  latLngSchema,
} = require('./validation');

const validTokens = config.API_KEY.split(',');

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

function createRouter() {
  const router = express.Router();
  // Simple token authentication
  router.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (_.includes(validTokens, apiKey)) {
      // eslint-disable-next-line
      req.user = {
        role: ROLES.ADMIN,
      };
    } else {
      // eslint-disable-next-line
      req.user = {
        role: ROLES.ANONYMOUS,
      };
    }

    return next();
  });

  router.get('/api/health', health.getHealth);

  const postOrderSchema = {
    body: orderSchema,
  };
  router.post(
    '/api/orders',
    validate(postOrderSchema),
    order.postOrder,
  );

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

  router.get('/api/promotions', _requireRole(ROLES.ADMIN), promotion.getPromotions);
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

  const postWebHook = {
    body: printmotorWebhookPayloadSchema,
  };
  router.post('/api/webhooks/printmotor', validate(postWebHook), webhook.postPrintmotor);

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

module.exports = createRouter;

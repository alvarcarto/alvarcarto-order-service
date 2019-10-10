const _ = require('lodash');
const { expect } = require('chai');
const sinon = require('sinon');
const { calculateCartPrice } = require('alvarcarto-price-util');
const { stripeInstance } = require('../../src/util/stripe');
const { createStripeMetadata } = require('../../src/core/checkout-core');
const basePaymentIntentCreated = require('../resources/base-payment-intent-created.json');
const basePaymentIntentSuccessEvent = require('../resources/base-payment-intent-success.json');
const createRequestInstance = require('./request');
const config = require('../../src/config');

async function createAndPayOrder(clientOrder, opts) {
  const request = opts.request || createRequestInstance;

  let postRes;
  await withStripePaymentIntentCreateStub(clientOrder, opts, async () => {
    postRes = await request()
      .post('/api/orders')
      .send(clientOrder)
      .expect(200);
  });

  const createdOrder = postRes.body;
  expect(createdOrder.paid).to.equal(false);

  const fullClientOrder = _.merge({}, clientOrder, {
    // Add backend generated fields
    orderId: createdOrder.orderId,
    createdAt: createdOrder.createdAt,
  });

  await sendStripePaymentIntentSuccess(fullClientOrder, opts);

  const getRes = await request().get(`/api/orders/${postRes.body.orderId}`).expect(200);
  const expectedPaidStatus = !opts.skipPayment;
  const modifiedPostResBody = _.omit(
    _.merge({}, postRes.body, { paid: expectedPaidStatus }),
    ['stripePaymentIntent'],
  );
  // If a promotion code expired when the order was made, it may change
  if (getRes.body.promotion) {
    _.set(modifiedPostResBody, 'promotion.hasExpired', _.get(getRes.body, 'promotion.hasExpired'));
  }

  expect(modifiedPostResBody).to.deep.equal(getRes.body);
  const fetchedOrder = getRes.body;
  return fetchedOrder;
}

async function withStripePaymentIntentCreateStub(clientOrder, _opts, func) {
  const request = _opts.request || createRequestInstance();

  let promotion;
  if (clientOrder.promotionCode) {
    const promotionRes = await request()
      .get(`/api/promotions/${clientOrder.promotionCode}`)
      .expect(200);
    promotion = promotionRes.body;
  }

  const opts = _.merge({
    currency: clientOrder.currency || 'eur',
    amount: calculateCartPrice(clientOrder.cart, { promotion, ignorePromotionExpiry: true }).value,
  }, _opts);

  const intent = createPaymentIntent(clientOrder, opts);
  sinon.stub(stripeInstance.paymentIntents, 'create').callsFake(() => intent);

  try {
    return await func();
  } finally {
    stripeInstance.paymentIntents.create.restore();
  }
}

async function sendStripePaymentIntentSuccess(fullClientOrder, _opts) {
  const request = _opts.request || createRequestInstance();

  let promotion;
  if (fullClientOrder.promotionCode) {
    const promotionRes = await request()
      .get(`/api/promotions/${fullClientOrder.promotionCode}`)
      .expect(200);
    promotion = promotionRes.body;
  }

  const price = calculateCartPrice(fullClientOrder.cart, {
    promotion,
    ignorePromotionExpiry: true,
  });
  const opts = _.merge({
    currency: fullClientOrder.currency || 'eur',
    amount: price.value,
    skipPayment: false,
  }, _opts);

  // https://github.com/stripe/stripe-node/blob/5cb8374f7d6e5e5fe5c749e30a2568c9811fb517/README.md#testing-webhook-signing
  const event = createPaymentIntentSuccessEvent(fullClientOrder, opts);
  const payloadString = JSON.stringify(event);

  const signature = stripeInstance.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: config.STRIPE_WEBHOOK_SECRET,
  });

  if (!opts.skipPayment) {
    await request()
      .post('/api/webhooks/stripe')
      .set('stripe-signature', signature)
      .send(event)
      .expect(200);
  }
}

function createPaymentIntentSuccessEvent(order, opts) {
  const currency = opts.currency.toLowerCase();
  const event = _.cloneDeep(basePaymentIntentSuccessEvent);
  const metadata = createStripeMetadata(order);

  _.set(event, 'data.object.amount', opts.amount);
  _.set(event, 'data.object.amount_received', opts.amount);
  _.set(event, 'data.object.currency', currency);
  _.set(event, 'data.object.metadata', metadata);

  _.set(event, 'data.object.charges.data.0.amount', opts.amount);
  _.set(event, 'data.object.charges.data.0.currency', currency);
  _.set(event, 'data.object.charges.data.0.metadata', metadata);

  return event;
}

function createPaymentIntent(order, opts) {
  const currency = opts.currency.toLowerCase();
  const intent = _.cloneDeep(basePaymentIntentCreated);
  const metadata = createStripeMetadata(order);

  _.set(intent, 'amount', opts.amount);
  _.set(intent, 'currency', currency);
  _.set(intent, 'metadata', metadata);

  return intent;
}

module.exports = {
  createAndPayOrder,
  withStripePaymentIntentCreateStub,
  sendStripePaymentIntentSuccess,
};

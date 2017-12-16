/* eslint-env mocha */

const { expect } = require('chai');
const _ = require('lodash');
const sinon = require('sinon');
const request = require('./util/request');
const stripeUtil = require('../src/util/stripe');
const fixturePromotions = require('./fixtures/promotions');
const { runFixture } = require('./util/knex');

/* eslint-disable global-require */
const data = {
  order1: {
    request: require('./resources/order1-request.json'),
    requestMissingStripeToken: require('./resources/order1-request-no-stripe-token.json'),
    response: require('./resources/order1-response.json'),
    stripeResponse: require('./resources/order1-stripe-charge-response.json'),
  },
  order2: {
    request: require('./resources/order2-request.json'),
    response: require('./resources/order2-response.json'),
  },
  order3: {
    request: require('./resources/order3-request.json'),
    response: require('./resources/order3-response.json'),
  },
  order4: {
    request: require('./resources/order4-request.json'),
    response: require('./resources/order4-response.json'),
  },
};

function test() {
  describe('orders', () => {
    before(() => {
      sinon.stub(stripeUtil.charges, 'create').callsFake(() => data.order1.stripeResponse);
    });

    after(() => {
      stripeUtil.charges.create.restore();
    });

    it('Brad Pitt orders 2 maps', async () => {
      const postRes = await request()
        .post('/api/orders')
        .send(data.order1.request)
        .expect(200);

      const getRes = await request().get(`/api/orders/${postRes.body.orderId}`).expect(200);
      const order = getRes.body;
      const expectedResponse = _.merge({}, data.order1.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('request without stripeTokenResponse should be rejected', () => {
      return request()
        .post('/api/orders')
        .send(data.order1.requestMissingStripeToken)
        .expect(400);
    });

    it('order with too high price should be rejected', () => {
      const modifiedRequest = _.cloneDeep(data.order1.request);
      modifiedRequest.cart[0].quantity = 300;

      return request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(400);
    });

    it('order with an expired promotion code should be rejected', async () => {
      await runFixture(fixturePromotions);

      const modifiedRequest = _.cloneDeep(data.order1.requestMissingStripeToken);
      modifiedRequest.promotionCode = 'EXPIREDFIXED5';
      await request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(400);
    });

    it('order with unrecognized promotion code and without stripeTokenResponse should fail', async () => {
      await runFixture(fixturePromotions);

      const modifiedRequest = _.cloneDeep(data.order1.requestMissingStripeToken);
      modifiedRequest.promotionCode = 'NOSUCHCODE';
      await request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(400);
    });

    it('order with unrecognized promotion code and but has stripeTokenResponse should go as if there was no promo code', async () => {
      await runFixture(fixturePromotions);

      const modifiedRequest = _.cloneDeep(data.order1.request);
      modifiedRequest.promotionCode = 'NOSUCHCODE';
      await request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(200);
    });

    it('get order details too fast and too many times should fail', async () => {
      const res = await request()
        .post('/api/orders')
        .send(data.order1.request)
        .expect(200);

      const requestInstance = request();
      for (let i = 0; i < 50; ++i) {
        await requestInstance.get(`/api/orders/${res.body.orderId}`).expect(200);
      }

      await requestInstance.get(`/api/orders/${res.body.orderId}`).expect(429);
    });

    it('gift card order should succeed', async () => {
      const postRes = await request()
        .post('/api/orders')
        .send(data.order2.request)
        .expect(200);

      expect(postRes.body).to.have.all.keys('orderId');
      const getRes = await request().get(`/api/orders/${postRes.body.orderId}`).expect(200);
      const order = getRes.body;
      const expectedResponse = _.merge({}, data.order2.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('order with mixed cart items should succeed', async () => {
      const postRes = await request()
        .post('/api/orders')
        .send(data.order3.request)
        .expect(200);

      expect(postRes.body).to.have.all.keys('orderId');
      const getRes = await request().get(`/api/orders/${postRes.body.orderId}`).expect(200);
      const order = getRes.body;
      const expectedResponse = _.merge({}, data.order3.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('order without shipping address, only digital card should succeed', async () => {
      const postRes = await request()
        .post('/api/orders')
        .send(data.order4.request)
        .expect(200);

      expect(postRes.body).to.have.all.keys('orderId');
      const getRes = await request().get(`/api/orders/${postRes.body.orderId}`).expect(200);
      const order = getRes.body;
      const expectedResponse = _.merge({}, data.order4.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('ordering too many times with limited promotion code should fail', async () => {
      await runFixture(fixturePromotions);

      const orderWithPromotion = _.merge({}, data.order1.request, {
        promotionCode: 'ONETIME',
      });
      await request().post('/api/orders').send(orderWithPromotion).expect(200);
      await request().post('/api/orders').send(orderWithPromotion).expect(400);
    });
  });
}

module.exports = test;

/* eslint-env mocha */

const { expect } = require('chai');
const _ = require('lodash');
const sinon = require('sinon');
const request = require('./util/request');
const ryanGoslingRequest = require('./resources/ryan-gosling-orders-giftcard-request.json');
const bradPittRequest = require('./resources/brad-pitt-orders-2-maps-request.json');
const stripeResponseJson = require('./resources/brad-pitt-orders-2-maps-stripe-response.json');
const partialResponse = require('./resources/brad-pitt-orders-2-maps-expected-api-response-partial.json');
const bradPittWithoutRequest = require('./resources/brad-pitt-orders-2-maps-request-missing-stripeTokenResponse.json');
const stripeUtil = require('../src/util/stripe');
const fixturePromotions = require('./fixtures/promotions');
const { runFixture } = require('./util/knex');

function test() {
  describe('orders', () => {
    before(() => {
      sinon.stub(stripeUtil.charges, 'create').callsFake(() => stripeResponseJson);
    });

    after(() => {
      stripeUtil.charges.create.restore();
    });

    it('Brad Pitt orders 2 maps', async () => {
      const postRes = await request()
        .post('/api/orders')
        .send(bradPittRequest)
        .expect(200);

      const getRes = await request().get(`/api/orders/${postRes.body.orderId}`).expect(200);
      const order = getRes.body;
      const expectedResponse = _.merge({}, partialResponse, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('request without stripeTokenResponse should be rejected', () => {
      return request()
        .post('/api/orders')
        .send(bradPittWithoutRequest)
        .expect(400);
    });

    it('order with too high price should be rejected', () => {
      const modifiedRequest = _.cloneDeep(bradPittRequest);
      modifiedRequest.cart[0].quantity = 300;

      return request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(400);
    });

    it('order with an expired promotion code should be rejected', async () => {
      await runFixture(fixturePromotions);

      const modifiedRequest = _.cloneDeep(bradPittWithoutRequest);
      modifiedRequest.promotionCode = 'EXPIREDFIXED5';
      await request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(400);
    });

    it('order with unrecognized promotion code and without stripeTokenResponse should fail', async () => {
      await runFixture(fixturePromotions);

      const modifiedRequest = _.cloneDeep(bradPittWithoutRequest);
      modifiedRequest.promotionCode = 'NOSUCHCODE';
      await request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(400);
    });

    it('order with unrecognized promotion code and but has stripeTokenResponse should go as if there was no promo code', async () => {
      await runFixture(fixturePromotions);

      const modifiedRequest = _.cloneDeep(bradPittRequest);
      modifiedRequest.promotionCode = 'NOSUCHCODE';
      await request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(200);
    });

    it('get order details too fast and too many times should fail', async () => {
      const res = await request()
        .post('/api/orders')
        .send(bradPittRequest)
        .expect(200);

      const requestInstance = request();
      for (let i = 0; i < 50; ++i) {
        await requestInstance.get(`/api/orders/${res.body.orderId}`).expect(200);
      }

      await requestInstance.get(`/api/orders/${res.body.orderId}`).expect(429);
    });

    it('gift card order should succeed', async () => {
      const res = await request()
        .post('/api/orders')
        .send(ryanGoslingRequest)
        .expect(200);

      expect(res.body).to.have.all.keys('orderId');
    });
  });
}

module.exports = test;

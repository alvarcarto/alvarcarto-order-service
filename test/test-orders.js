/* eslint-env mocha */

const { expect } = require('chai');
const _ = require('lodash');
const request = require('./util/request');
const fixturePromotions = require('./fixtures/promotions');
const { runFixture } = require('./util/knex');
const { createAndPayOrder, withStripePaymentIntentCreateStub } = require('./util/order');

/* eslint-disable global-require */
const data = {
  order1: {
    request: require('./resources/order1-request.json'),
    response: require('./resources/order1-response.json'),
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
  order7: {
    request: require('./resources/order7-request.json'),
    response: require('./resources/order7-response.json'),
  },
  order8: {
    request: require('./resources/order8-request.json'),
    response: require('./resources/order8-response.json'),
  },
};

function test() {
  describe('orders', () => {
    it('Brad Pitt orders 2 maps', async () => {
      const order = await createAndPayOrder(data.order1.request);

      const expectedResponse = _.merge({}, data.order1.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('Brad Pitt orders 2 maps with high class production', async () => {
      const order = await createAndPayOrder(data.order7.request);

      const expectedResponse = _.merge({}, data.order7.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('order with an expired promotion code should be rejected', async () => {
      await runFixture(fixturePromotions);

      const modifiedRequest = _.cloneDeep(data.order1.request);
      modifiedRequest.promotionCode = 'EXPIREDFIXED5';
      await request()
        .post('/api/orders')
        .send(modifiedRequest)
        .expect(400);
    });

    it('get order details too fast and too many times should fail', async () => {
      const order = await createAndPayOrder(data.order1.request);
      const requestInstance = request();
      for (let i = 0; i < 30; ++i) {
        await requestInstance.get(`/api/orders/${order.orderId}`).expect(200);
      }

      await requestInstance.get(`/api/orders/${order.orderId}`).expect(429);
    });

    it('creating orders too fast and too many times should fail', async function () {
      this.timeout(10000);

      const requestInstance = request();

      for (let i = 0; i < 30; ++i) {
        await createAndPayOrder(data.order1.request, { request: () => requestInstance });
      }

      await withStripePaymentIntentCreateStub(data.order1.request, {}, async () => {
        await requestInstance.post('/api/orders').send(data.order1.request).expect(429);
      });
    });

    it('gift card order should succeed', async () => {
      const order = await createAndPayOrder(data.order2.request);
      const expectedResponse = _.merge({}, data.order2.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('order with mixed cart items should succeed', async () => {
      const order = await createAndPayOrder(data.order3.request);
      const expectedResponse = _.merge({}, data.order3.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('order without shipping address, only digital card should succeed', async () => {
      const order = await createAndPayOrder(data.order4.request);
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
      await createAndPayOrder(orderWithPromotion);

      await withStripePaymentIntentCreateStub(orderWithPromotion, {}, async () => {
        await request().post('/api/orders').send(orderWithPromotion).expect(400);
      });
    });


    it('ordering but leaving it unpaid should not use a promotion code', async () => {
      await runFixture(fixturePromotions);

      const orderWithPromotion = _.merge({}, data.order1.request, {
        promotionCode: 'ONETIME',
      });

      await withStripePaymentIntentCreateStub(orderWithPromotion, {}, async () => {
        await request().post('/api/orders').send(orderWithPromotion).expect(200);
        await request().post('/api/orders').send(orderWithPromotion).expect(200);
        await request().post('/api/orders').send(orderWithPromotion).expect(200);
      });
    });

    it('Brad Pitt orders maps of each inch size', async () => {
      const order = await createAndPayOrder(data.order8.request);
      const expectedResponse = _.merge({}, data.order8.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,
      });

      expect(order).to.deep.equal(expectedResponse);
    });

    it('ordering but leaving it unpaid should show as paid: false', async () => {
      const order = await createAndPayOrder(data.order8.request, { skipPayment: true });
      const expectedResponse = _.merge({}, data.order8.response, {
        // Add backend generated fields
        orderId: order.orderId,
        createdAt: order.createdAt,

        // This should be returned
        paid: false,
      });

      expect(order).to.deep.equal(expectedResponse);
    });
  });
}

module.exports = test;

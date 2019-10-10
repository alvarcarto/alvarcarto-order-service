/* eslint-env mocha */

const _ = require('lodash');
const sinon = require('sinon');
const nock = require('nock');
const request = require('./util/request');
const bucketCore = require('../src/core/bucket-core');
const sendToProductionWorker = require('../src/worker/send-posters-to-production');
const fixturePromotions = require('./fixtures/promotions');
const { runFixture } = require('./util/knex');
const { expectDeepEqual } = require('./util');
const { createAndPayOrder } = require('./util/order');

const sendToProduction = sendToProductionWorker.main;

/* eslint-disable global-require */
const data = {
  order5: {
    request: require('./resources/order5-request.json'),
    printmotorRequest: require('./resources/order5-printmotor-request.json'),
    printmotorResponse: require('./resources/order5-printmotor-response.json'),
  },
  order6: {
    request: require('./resources/order6-request.json'),
    printmotorRequest: require('./resources/order6-printmotor-request.json'),
    printmotorResponse: require('./resources/order6-printmotor-response.json'),
  },
  order7: {
    request: require('./resources/order7-request.json'),
    printmotorRequest: require('./resources/order7-printmotor-request.json'),
    printmotorResponse: require('./resources/order7-printmotor-response.json'),
  },
};

function test() {
  describe('Printmotor integration', function() {
    this.timeout(120000);
    this.slow(30000);

    before(() => {
      sinon.stub(bucketCore.s3, 'uploadBluebirdAsync')
        .callsFake(() => ({ Location: 'https://fake-s3-url.com/posters/order-item0.png' }));
    });

    after(() => {
      bucketCore.s3.uploadBluebirdAsync.restore();
    });

    it('sending order to production should work', async () => {
      await runFixture(fixturePromotions);

      const order = await createAndPayOrder(data.order5.request);
      const expectedBody = _.merge({}, data.order5.printmotorRequest, {
        meta: {
          reference: order.orderId,
        },
      });
      const printmotorResponse = _.merge({}, data.order5.printmotorResponse, {
        meta: {
          reference: order.orderId,
        },
      });
      nock('https://fakeuser:fakepassword@mocked-printmotor-not-real.com')
        .post('/api/v1/order', body => expectDeepEqual(body, expectedBody))
        .reply(200, printmotorResponse);

      await sendToProduction({ throwOnError: true });
    });

    it('sending express order to production should work (via promotion code)', async () => {
      await runFixture(fixturePromotions);

      const order = await createAndPayOrder(data.order6.request);

      const expectedBody = _.merge({}, data.order6.printmotorRequest, {
        meta: {
          reference: order.orderId,
        },
      });
      const printmotorResponse = _.merge({}, data.order6.printmotorResponse, {
        meta: {
          reference: order.orderId,
        },
      });
      nock('https://fakeuser:fakepassword@mocked-printmotor-not-real.com')
        .post('/api/v1/order', body => expectDeepEqual(body, expectedBody))
        .reply(200, printmotorResponse);

      await sendToProduction({ throwOnError: true });
    });

    it('sending express order to production should work (via cart items)', async () => {
      await runFixture(fixturePromotions);

      const order = await createAndPayOrder(data.order7.request);

      const expectedBody = _.merge({}, data.order7.printmotorRequest, {
        meta: {
          reference: order.orderId,
        },
      });
      const printmotorResponse = _.merge({}, data.order7.printmotorResponse, {
        meta: {
          reference: order.orderId,
        },
      });
      nock('https://fakeuser:fakepassword@mocked-printmotor-not-real.com')
        .post('/api/v1/order', body => expectDeepEqual(body, expectedBody))
        .reply(200, printmotorResponse);

      await sendToProduction({ throwOnError: true });
    });
  });
}

module.exports = test;

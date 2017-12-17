/* eslint-env mocha */

const _ = require('lodash');
const sinon = require('sinon');
const nock = require('nock');
const request = require('./util/request');
const stripeUtil = require('../src/util/stripe');
const bucketCore = require('../src/core/bucket-core');
const sendToProductionWorker = require('../src/worker/send-posters-to-production');
const fixturePromotions = require('./fixtures/promotions');
const { runFixture } = require('./util/knex');
const { expectDeepEqual } = require('./util');

const sendToProduction = sendToProductionWorker.main;

/* eslint-disable global-require */
const data = {
  order1: {
    stripeResponse: require('./resources/order1-stripe-charge-response.json'),
  },
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
};

function test() {
  describe('Printmotor integration', function() {
    this.timeout(120000);
    this.slow(30000);

    before(() => {
      sinon.stub(stripeUtil.charges, 'create').callsFake(() => data.order1.stripeResponse);
      sinon.stub(bucketCore.s3, 'uploadAsync')
        .callsFake(() => ({ Location: 'https://fake-s3-url.com/posters/order-item0.png' }));
    });

    after(() => {
      stripeUtil.charges.create.restore();
      bucketCore.s3.uploadAsync.restore();
    });

    it('sending order to production should work', async () => {
      await runFixture(fixturePromotions);

      const res = await request()
        .post('/api/orders')
        .send(data.order5.request)
        .expect(200);

      const expectedBody = _.merge({}, data.order5.printmotorRequest, {
        meta: {
          reference: res.body.orderId,
        },
      });
      const printmotorResponse = _.merge({}, data.order5.printmotorResponse, {
        meta: {
          reference: res.body.orderId,
        },
      });
      nock('https://fakeuser:fakepassword@mocked-printmotor-not-real.com')
        .post('/api/v1/order', body => expectDeepEqual(body, expectedBody))
        .reply(200, printmotorResponse);

      await sendToProduction({ throwOnError: true });
    });

    it('sending express order to production should work', async () => {
      await runFixture(fixturePromotions);

      const res = await request()
        .post('/api/orders')
        .send(data.order6.request)
        .expect(200);

      const expectedBody = _.merge({}, data.order6.printmotorRequest, {
        meta: {
          reference: res.body.orderId,
        },
      });
      const printmotorResponse = _.merge({}, data.order6.printmotorResponse, {
        meta: {
          reference: res.body.orderId,
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

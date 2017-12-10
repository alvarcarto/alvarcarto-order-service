/* eslint-env mocha */

const { expect } = require('chai');
const _ = require('lodash');
const sinon = require('sinon');
const request = require('./util/request')();
const testJson = require('./resources/brad-pitt-orders-2-maps-request.json');
const stripeResponseJson = require('./resources/brad-pitt-orders-2-maps-stripe-response.json');
const partialResponse = require('./resources/brad-pitt-orders-2-maps-expected-api-response-partial.json');
const stripeUtil = require('../src/util/stripe');

function test() {
  describe('orders', () => {
    before(() => {
      sinon.stub(stripeUtil.charges, 'create').callsFake(() => stripeResponseJson);
    });

    after(() => {
      stripeUtil.charges.create.restore();
    });

    it('create an order', () => {
      return request
        .post('/api/orders')
        .send(testJson)
        .expect(200)
        .then((res) => {
          return request.get(`/api/orders/${res.body.orderId}`)
            .expect(200);
        })
        .then((res) => {
          const order = res.body;
          const expectedResponse = _.merge({}, partialResponse, {
            // Add backend generated fields
            orderId: order.orderId,
            createdAt: order.createdAt,
          });

          expect(order).to.deep.equal(expectedResponse);
        });
    });
  });
}

module.exports = test;

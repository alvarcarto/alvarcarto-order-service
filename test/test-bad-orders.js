/* eslint-env mocha */

const { expect } = require('chai');
const _ = require('lodash');
const request = require('./util/request');

/* eslint-disable global-require */
const data = {
  badOrder1: require('./resources/bad-order-request-1.json'),
  badOrder2: require('./resources/bad-order-request-2.json'),
  badOrder3: require('./resources/bad-order-request-3.json'),
  badOrder4: require('./resources/bad-order-request-4.json'),
  badOrder5: require('./resources/bad-order-request-5.json'),
  //badOrder6: require('./resources/bad-order-request-6.json'),
};

function assertErrorIsForField(res, field) {
  if (!_.isString(field)) {
    throw new Error('`field` must be a string');
  }

  expect(res.body.errors[0].field).to.equal(field);
  expect(res.body.errors).to.have.lengthOf(1);
}

function assertErrorIsForFields(res, fields) {
  if (!_.isArray(fields)) {
    throw new Error('`fields` must be an array');
  }

  _.forEach(fields, (field) => {
    const error = _.find(res.body.errors, e => e.field === field);
    if (!error) {
      throw new Error(`Response is missing an expected error field: ${field}`);
    }
  });
  expect(res.body.errors).to.have.lengthOf(fields.length);
}

function assertIsErrorResponse(res) {
  expect(res.body.status).to.be.a('number');
  expect(res.body.statusText).to.be.a('string');
  expect(res.body.errors).to.be.an('array');
}

function test() {
  describe('bad orders', () => {
    it('negative quantity should not be accepted', async () => {
      const res = await request()
        .post('/api/orders')
        .send(data.badOrder1)
        .expect(400);

      assertIsErrorResponse(res);
      assertErrorIsForField(res, 'cart.0.quantity');
    });

    it('zero quantity should not be accepted', async () => {
      const res = await request()
        .post('/api/orders')
        .send(data.badOrder2)
        .expect(400);

      assertIsErrorResponse(res);
      assertErrorIsForField(res, 'cart.0.quantity');
    });

    it('cart item type should default to mapPoster', async () => {
      const res = await request()
        .post('/api/orders')
        // The first cart item has invalid orientation value
        // mapPoster only accepts "landscape" or "portrait"
        .send(data.badOrder3)
        .expect(400);

      assertIsErrorResponse(res);
      assertErrorIsForField(res, 'cart.0.orientation');
    });

    // This is something we may want to allow later, but not currently supported
    it('cart item type=mapPoster should not allow empty labels', async () => {
      const res = await request()
        .post('/api/orders')
        // The first cart item has invalid orientation value
        // mapPoster only accepts "landscape" or "portrait"
        .send(data.badOrder4)
        .expect(400);

      assertIsErrorResponse(res);
      assertErrorIsForFields(res, ['cart.0.labelHeader', 'cart.0.labelSmallHeader', 'cart.0.labelText']);
    });

    it('cart item type=giftCardValue should not allow negative value', async () => {
      const res = await request()
        .post('/api/orders')
        // The first cart item has invalid orientation value
        // mapPoster only accepts "landscape" or "portrait"
        .send(data.badOrder5)
        .expect(400);

      assertIsErrorResponse(res);
      assertErrorIsForField(res, 'cart.0.value');
    });
  });
}

module.exports = test;

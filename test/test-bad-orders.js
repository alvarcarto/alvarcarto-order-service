/* eslint-env mocha */

const { expect } = require('chai');
const _ = require('lodash');
const request = require('./util/request');

/* eslint-disable global-require */
const data = {
  badOrder1: require('./resources/bad-order1-request.json'),
  badOrder2: require('./resources/bad-order2-request.json'),
  badOrder3: require('./resources/bad-order3-request.json'),
  badOrder4: require('./resources/bad-order4-request.json'),
  badOrder5: require('./resources/bad-order5-request.json'),
  badOrder6: require('./resources/bad-order6-request.json'),
};

// Joi nowadays reports error path as ['cart', 0, 'quantity'] instead of
// cart.0.quantity. For testing, it's a bit more convenient to use the string
// notatation. This helper compares across those formats
// https://github.com/hapijs/joi/issues/1302
function assertFields(fieldArr, fieldStr) {
  const strs = _.map(fieldArr, item => String(item));
  expect(strs.join('.')).to.equal(fieldStr);
}

function areEqualFields(fieldArr, fieldStr) {
  const strs = _.map(fieldArr, item => String(item));
  return strs.join('.') === fieldStr;
}

function assertErrorIsForField(res, field) {
  if (!_.isString(field)) {
    throw new Error('`field` must be a string');
  }

  assertFields(res.body.errors[0].field, field);
  expect(res.body.errors).to.have.lengthOf(1);
}

function assertErrorIsForFields(res, fields) {
  if (!_.isArray(fields)) {
    throw new Error('`fields` must be an array');
  }

  _.forEach(fields, (field) => {
    const error = _.find(res.body.errors, e => areEqualFields(e.field, field));
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
        .send(data.badOrder4)
        .expect(400);

      assertIsErrorResponse(res);
      assertErrorIsForFields(res, ['cart.0.labelHeader', 'cart.0.labelSmallHeader', 'cart.0.labelText']);
    });

    it('cart item type=giftCardValue should not allow negative value', async () => {
      const res = await request()
        .post('/api/orders')
        .send(data.badOrder5)
        .expect(400);

      assertIsErrorResponse(res);
      assertErrorIsForField(res, 'cart.0.value');
    });

    it('order without shipping address with shippable products in cart should fail', async () => {
      const res = await request()
        .post('/api/orders')
        .send(data.badOrder6)
        .expect(400);

      assertIsErrorResponse(res);
    });
  });
}

module.exports = test;

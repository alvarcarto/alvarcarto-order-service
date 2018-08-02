/* eslint-env mocha */

const _ = require('lodash');
const { expect } = require('chai');
const request = require('./util/request');
const fixturePromotions = require('./fixtures/promotions');
const { runFixture } = require('./util/knex');

function test() {
  describe('promotions', () => {
    it('get expired promotion should work', async () => {
      await runFixture(fixturePromotions);
      const res = await request().get('/api/promotions/EXPIREDFIXED5').expect(200);

      const withoutDynamic = _.omit(res.body, ['createdAt']);
      expect(withoutDynamic).to.deep.equal({
        currency: 'EUR',
        hasExpired: true,
        label: '-5€',
        promotionCode: 'EXPIREDFIXED5',
        type: 'FIXED',
        value: 500,
      });
    });

    it('get expired promotion with expiredAsOk=false should return error', async () => {
      await runFixture(fixturePromotions);
      await request()
        .get('/api/promotions/EXPIREDFIXED5')
        .query({ expiredAsOk: false })
        .expect(404);
    });

    it('get all promotions should not be possible as anonymous request', async () => {
      await runFixture(fixturePromotions);
      await request()
        .get('/api/promotions')
        .expect(401);
    });

    it('get promotions too fast and too many times should fail', async () => {
      await runFixture(fixturePromotions);

      const requestInstance = request();
      for (let i = 0; i < 50; ++i) {
        await requestInstance.get(`/api/promotions/PROMOCODE${i}`).expect(404);
      }

      await requestInstance.get('/api/promotions/PROMOCODE100').expect(429);
    });
  });
}

module.exports = test;

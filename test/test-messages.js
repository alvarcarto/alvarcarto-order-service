/* eslint-env mocha */

const { expect } = require('chai');
const request = require('./util/request');

function test() {
  describe('/api/currentMessage', () => {
    it('current message should return correct', () => {
      return request()
        .get('/api/currentMessage')
        .expect(200)
        .then((res) => {
          expect(res.body).to.deep.equal({
            start: '2010-01-01T00:00:00.000Z',
            end: '2030-01-01T00:00:00.000Z',
            title: 'Test title',
            message: 'Test message',
            icon: 'fire',
          });
        });
    });
  });
}

module.exports = test;

/* eslint-env mocha */

const { expect } = require('chai');
const request = require('./util/request');

function test() {
  describe('/api/health', () => {
    it('health endpoint should return 200', () => {
      return request()
        .get('/api/health')
        .expect(200)
        .then((res) => {
          expect(res.body).to.deep.equal({ success: true });
        });
    });
  });
}

module.exports = test;

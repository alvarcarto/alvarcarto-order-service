const request = require('supertest');
const createApp = require('../../src/app');

function createRequest() {
  return request(createApp());
}

module.exports = createRequest;

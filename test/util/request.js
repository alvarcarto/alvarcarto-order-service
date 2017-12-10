const createApp = require('../../src/app');
const request = require('supertest');

function createRequest() {
  return request(createApp());
}

module.exports = createRequest;

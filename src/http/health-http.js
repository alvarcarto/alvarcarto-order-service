const ex = require('../util/express');
const healthCore = require('../core/health-core');

const getHealth = ex.createJsonRoute(() => healthCore.assertHealth());

module.exports = {
  getHealth,
};

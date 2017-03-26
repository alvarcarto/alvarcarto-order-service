const ex = require('../util/express');
const healthCore = require('../core/health-core');

const getHealth = ex.createJsonRoute((req) => {
  return healthCore.assertHealth();
});

module.exports = {
  getHealth,
};

/* eslint-env mocha */

const mockery = require('mockery');
const { knex, migrateAllDownAndUp } = require('./util/knex');
const logger = require('../src/util/logger')(__filename);
const appConfig = require('../src/config');
const testHealth = require('./test-health');
const testProducts = require('./test-products');
const testOrders = require('./test-orders');

if (appConfig.NODE_ENV !== 'test') {
  throw new Error(`Invalid NODE_ENV! Should be 'test', but found '${appConfig.NODE_ENV}'`);
}

describe('Alvar Carto Order API', () => {
  logger.info('Database is reset before each test case.');
  beforeEach(() => migrateAllDownAndUp());

  before(() => {
    mockery.enable({ useCleanCache: true, warnOnUnregistered: false });
  });
  after(() => {
    knex.destroy();
    mockery.disable();
  });

  testHealth();
  testProducts();
  testOrders();
});

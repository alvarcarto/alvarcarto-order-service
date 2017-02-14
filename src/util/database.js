const logger = require('./logger')(__filename);
const databaseConfig = require('../../knexfile').config;
const Knex = require('knex');

module.exports = {
  connect: connect,
  knex: Knex(databaseConfig);
  config: databaseConfig
};
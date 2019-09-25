const databaseConfig = require('../../knexfile');
const Knex = require('knex');

module.exports = {
  knex: Knex(databaseConfig),
  config: databaseConfig,
};

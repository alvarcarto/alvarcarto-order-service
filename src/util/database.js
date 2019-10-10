const Knex = require('knex');
const databaseConfig = require('../../knexfile');

module.exports = {
  knex: Knex(databaseConfig),
  config: databaseConfig,
};

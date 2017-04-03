const _ = require('lodash');
const { knex } = require('../util/database');

function assertHealth() {
  return knex.raw('SELECT * from migrations')
    .then((result) => {
      if (_.isEmpty(result.rows)) {
        throw new Error('Migrations table was empty');
      }

      return { success: true };
    });
}

module.exports = {
  assertHealth,
};

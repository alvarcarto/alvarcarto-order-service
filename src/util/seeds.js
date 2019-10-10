/* eslint-disable no-console */

const config = require('../config');

// Inserts or updates a row to table
function insertOrUpdate(knex, table, row, column = 'id') {
  return knex(table).select().where(column, row[column])
    .then((rows) => {
      if (rows.length > 0) {
        maybeLog('Update row', column, row[column], 'in', table);
        return knex(table).where(column, row[column]).update(row);
      }

      maybeLog('Insert row', column, row[column], 'in', table);
      return knex(table).insert(row);
    });
}

function maybeLog(...args) {
  if (config.VERBOSE_SEEDS) {
    console.log(...args);
  }
}

module.exports = {
  insertOrUpdate,
};

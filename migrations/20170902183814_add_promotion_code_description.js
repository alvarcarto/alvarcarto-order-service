exports.up = function(knex) {
  return Promise.resolve()
  .then(() => knex.schema.table('promotions', function(table) {
    table.text('description');
  }));
};

exports.down = function(knex) {
  return Promise.resolve()
    .then(() => knex.schema.table('promotions', function(table) {
      table.dropColumn('description');
    }));
};

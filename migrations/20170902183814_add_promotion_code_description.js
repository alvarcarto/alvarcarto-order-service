exports.up = function(knex, Promise) {
  return Promise.resolve()
  .then(() => knex.schema.table('promotions', function(table) {
    table.text('description');
  }));
};

exports.down = function(knex, Promise) {
  return Promise.resolve()
    .then(() => knex.schema.table('promotions', function(table) {
      table.dropColumn('description');
    }));
};

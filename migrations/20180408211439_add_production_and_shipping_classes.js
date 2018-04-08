exports.up = function(knex, Promise) {
  return Promise.resolve()
  .then(() => knex.schema.table('orders', function(table) {
    table.string('shipping_class');
    table.string('production_class');
  }));
};

exports.down = function(knex, Promise) {
  return Promise.resolve()
    .then(() => knex.schema.table('orders', function(table) {
      table.dropColumn('shipping_class');
      table.dropColumn('production_class');
    }));
};

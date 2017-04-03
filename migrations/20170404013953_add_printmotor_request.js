exports.up = function(knex, Promise) {
  return knex.schema.table('orders', function(table) {
    table.jsonb('printmotor_order_request').defaultTo(null);
  });
};

exports.down = function(knex, Promise) {
  return knex.schema.table('orders', function(table) {
    table.dropColumn('printmotor_order_request');
  });
};

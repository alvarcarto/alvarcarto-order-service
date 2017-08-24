exports.up = function(knex, Promise) {
  return knex.schema.table('orders', function(table) {
    table.string('printmotor_order_id').index().defaultTo(null);
  })
  .then(() =>
    knex.schema.createTable('webhook_events', function(table) {
      table.bigIncrements('id').primary().index();
      table.bigInteger('order_id').notNullable().index();
      table.foreign('order_id')
        .references('id')
        .inTable('orders')
        .onDelete('RESTRICT')
        .onUpdate('CASCADE');

      table.string('event', 256).notNullable();
      table.jsonb('payload');

      table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
    })
  )
};

exports.down = function(knex, Promise) {
  return knex.schema.table('orders', function(table) {
    table.dropColumn('printmotor_order_id');
  })
  .then(() => knex.schema.dropTable('webhook_events'));
};

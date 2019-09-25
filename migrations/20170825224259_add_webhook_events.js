exports.up = function(knex) {
  return knex.schema.table('orders', function(table) {
    table.string('printmotor_order_id').index().defaultTo(null);
    table.jsonb('printmotor_order_response').defaultTo(null);
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

exports.down = function(knex) {
  return knex.schema.table('orders', function(table) {
    table.dropColumn('printmotor_order_id');
    table.dropColumn('printmotor_order_response');
  })
  .then(() => knex.schema.dropTable('webhook_events'));
};

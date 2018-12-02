exports.up = function(knex, Promise) {
  return Promise.resolve()
    .then(() =>
      knex.schema.createTable('sent_emails', (table) => {
        table.bigIncrements('id').primary().index();
        table.bigInteger('order_id').notNullable().index();
        table.foreign('order_id')
          .references('id')
          .inTable('orders')
          .onDelete('RESTRICT')
          .onUpdate('CASCADE');

        table.string('type', 256).notNullable();

        table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
      })
    )
};

exports.down = function(knex, Promise) {
  return Promise.resolve()
    .then(() => knex.schema.dropTable('sent_emails'));
};

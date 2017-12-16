exports.up = (knex, Promise) => {
  return knex.schema.createTable('ordered_gift_items', (table) => {
    table.bigIncrements('id').primary().index();
    table.bigInteger('order_id').notNullable().index();
    table.foreign('order_id')
      .references('id')
      .inTable('orders')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    table.string('type').notNullable();
    table.integer('quantity').notNullable();
    table.integer('value').defaultTo(null);

    // Integer, value as in Stripe
    table.integer('customer_unit_price_value').notNullable();
    table.string('customer_unit_price_currency').notNullable();
    table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = (knex, Promise) => {
  return knex.schema.dropTable('ordered_gift_items');
};

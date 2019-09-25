exports.up = function(knex) {
  return knex.schema.createTable('promotions', function(table) {
    table.bigIncrements('id').primary().index();
    table.string('type', 512).notNullable();
    table.float('value').notNullable();
    table.string('promotion_code', 512).index().unique().notNullable();
    table.string('label', 512).notNullable();
    table.string('currency', 8).notNullable().defaultTo('EUR');
    table.timestamp('expires_at').defaultTo(null);
    table.integer('usage_count').notNullable().defaultTo(0);
    table.integer('max_allowed_usage_count').defaultTo(null);
    table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
  })
  .then(() => knex.schema.table('orders', function(table) {
    table.string('promotion_code', 512);
  }));
};

exports.down = function(knex) {
  return knex.schema.dropTable('promotions')
    .then(() => knex.schema.table('orders', function(table) {
      table.dropColumn('promotion_code');
    }));
};

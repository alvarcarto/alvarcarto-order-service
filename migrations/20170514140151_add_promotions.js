exports.up = function(knex, Promise) {
  return knex.schema.createTable('promotions', function(table) {
    table.bigIncrements('id').primary().index();
    table.string('type', 512).unique().notNullable();
    table.float('value').notNullable();
    table.string('promotion_code', 512).unique().notNullable();
    table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function(knex, Promise) {
  return knex.schema.dropTable('promotions');
};
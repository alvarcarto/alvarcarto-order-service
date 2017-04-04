exports.up = function(knex, Promise) {
  return knex.schema.createTable('orders', function(table) {
    table.bigIncrements('id').primary().index();
    table.string('pretty_order_id', 512).unique().notNullable();
    table.string('customer_email', 512).notNullable();
    table.boolean('email_subscription').notNullable();
    table.boolean('different_billing_address').notNullable();
    table.string('stripe_token_id', 64).notNullable().unique().index();
    table.jsonb('stripe_token_response').notNullable();
    table.jsonb('stripe_charge_response').notNullable();
    table.timestamp('sent_to_production_at').index().defaultTo(null);
    table.jsonb('printmotor_order_request').defaultTo(null);
    table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
  })
  .then(() =>
    knex.schema.createTable('failed_orders', function(table) {
      table.bigIncrements('id').primary().index();
      table.string('pretty_order_id', 512);
      table.jsonb('full_order');
      table.text('error_message');
      table.text('error_stack');
      table.string('error_code');
      table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
    })
  )
  .then(() =>
    knex.schema.createTable('addresses', function(table) {
      table.bigIncrements('id').primary().index();
      table.bigInteger('order_id').notNullable().index();
      table.foreign('order_id')
        .references('id')
        .inTable('orders')
        .onDelete('RESTRICT')
        .onUpdate('CASCADE');
      // One of 'BILLING', 'SHIPPING'
      table.string('type', 128).notNullable();
      table.string('person_name', 512).notNullable();
      table.string('street_address', 512).notNullable();
      table.string('street_address_extra', 512);
      table.string('city', 512).notNullable();
      table.string('postal_code', 32).notNullable();
      table.string('country_code', 4).notNullable();
      table.string('state', 256);
      table.string('contact_phone', 256);
      table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
    })
  )
  .then(() =>
    knex.raw('CREATE UNIQUE INDEX addresses_order_id_type_index ON addresses (order_id, type)')
  )
  .then(() =>
    knex.schema.createTable('ordered_posters', function(table) {
      table.bigIncrements('id').primary().index();
      table.bigInteger('order_id').notNullable().index();
      table.foreign('order_id')
        .references('id')
        .inTable('orders')
        .onDelete('RESTRICT')
        .onUpdate('CASCADE');
      table.integer('quantity').notNullable();
      // Integer, value as in Stripe
      table.integer('customer_unit_price_value').notNullable();
      table.string('customer_unit_price_currency').notNullable();
      table.float('map_south_west_lat', 8).notNullable();
      table.float('map_south_west_lng', 8).notNullable();
      table.float('map_north_east_lat', 8).notNullable();
      table.float('map_north_east_lng', 8).notNullable();
      table.float('map_center_lat', 8);
      table.float('map_center_lng', 8);
      table.float('map_zoom');
      table.string('map_style').notNullable();
      table.integer('map_pitch');
      table.integer('map_bearing');
      table.string('size', 20).notNullable();
      table.string('orientation', 20).notNullable();
      table.boolean('labels_enabled').notNullable();
      table.string('label_header').notNullable();
      table.string('label_small_header').notNullable();
      table.string('label_text', 512).notNullable();
      table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
    })
  );
};

exports.down = function(knex, Promise) {
  return knex.schema.dropTable('addresses')
    .then(() => knex.schema.dropTable('ordered_posters'))
    .then(() => knex.schema.dropTable('orders'))
    .then(() => knex.schema.dropTable('failed_orders'));
};
exports.up = function(knex) {
  return Promise.resolve()
    .then(() =>
      knex.schema.createTable('payments', (table) => {
        table.bigIncrements('id').primary().index();
        table.bigInteger('order_id').notNullable().index();
        table.foreign('order_id')
          .references('id')
          .inTable('orders')
          .onDelete('RESTRICT')
          .onUpdate('CASCADE');

        // "CHARGE" or "REFUND"
        table.string('type', 256).notNullable().index();

        // In cents
        table.integer('amount').notNullable();

        // EUR / USD
        table.string('currency', 32).notNullable();

        // "STRIPE" or "INTERNAL_GIFT" or "PURCHASED_GIFT"
        table.string('payment_provider', 256).notNullable().index();

        // STRIPE: "STRIPE_CHARGE" or "STRIPE_PAYMENT_INTENT"
        table.string('payment_provider_method', 256).index();

        // The old stripe charge method data
        table.string('stripe_token_id', 64).index();
        table.jsonb('stripe_token_response');
        table.jsonb('stripe_charge_response');

        // The stripe payment intent method data
        table.string('stripe_payment_intent_id', 64).index();
        table.jsonb('stripe_payment_intent_create_response');
        table.jsonb('stripe_payment_intent_final_event');


        table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
      })
    )
    // Move all stripe charges
    .then(() => knex.raw(`
      INSERT INTO payments (order_id, type, amount, currency, payment_provider, payment_provider_method, stripe_token_id, stripe_token_response, stripe_charge_response)
      SELECT orders.id, 'CHARGE', (orders.stripe_charge_response->>'amount')::int, 'EUR', 'STRIPE', 'STRIPE_CHARGE', orders.stripe_token_id, orders.stripe_token_response, orders.stripe_charge_response
      FROM orders
      WHERE orders.stripe_token_id IS NOT NULL
    `))
    // Move all internal gift purchases
    .then(() => knex.raw(`
      INSERT INTO payments (order_id, type, amount, currency, payment_provider)
      SELECT
        orders.id,
        'CHARGE',
        (
          SELECT SUM(customer_unit_price_value * quantity) FROM ordered_posters
            WHERE ordered_posters.order_id = orders.id
        ),
        'EUR',
        'INTERNAL_GIFT'
      FROM orders
      WHERE orders.stripe_token_id IS NULL
    `))
    .then(() => knex.schema.table('orders', (table) => {
      table.dropColumn('stripe_token_id');
      table.dropColumn('stripe_token_response');
      table.dropColumn('stripe_charge_response');
    }))
    .then(() => knex.schema.dropTable('webhook_events'));
};

exports.down = function(knex) {
  return Promise.resolve()
    .then(() => knex.schema.table('orders', (table) => {
      //table.string('stripe_token_id', 64).unique().index();
      //table.jsonb('stripe_token_response');
      //table.jsonb('stripe_charge_response');
    }))
    // Move all stripe charges
    .then(() => knex.raw(`
      UPDATE orders
      SET
        stripe_token_id = payments.stripe_token_id,
        stripe_token_response = payments.stripe_token_response,
        stripe_charge_response = payments.stripe_charge_response
      FROM payments
      WHERE orders.id = payments.order_id
      AND payments.stripe_token_id IS NOT NULL
    `))
    .then(() => knex.schema.dropTable('payments'));
};
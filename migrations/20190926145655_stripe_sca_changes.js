exports.up = (knex) => {
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

        // "STRIPE" or "PROMOTION" or "GIFTCARD"
        table.string('payment_provider', 256).notNullable().index();

        // STRIPE: "STRIPE_CHARGE" or "STRIPE_PAYMENT_INTENT"
        table.string('payment_provider_method', 256).index();

        // When a gift code is used
        table.bigInteger('promotion_id').index();
        table.foreign('promotion_id')
          .references('id')
          .inTable('promotions')
          .onDelete('RESTRICT')
          .onUpdate('RESTRICT');

        // The old stripe charge method data
        table.string('stripe_token_id', 64).index();
        table.jsonb('stripe_token_response');
        table.jsonb('stripe_charge_response');

        // The stripe payment intent method data
        table.string('stripe_payment_intent_id', 64).index();
        table.jsonb('stripe_payment_intent_success_event');

        table.timestamp('created_at').index().notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').index().notNullable().defaultTo(knex.fn.now());
      })
    )
    // Move all 100% stripe charges
    .then(() => knex.raw(`
      INSERT INTO payments (order_id, type, amount, currency, payment_provider, payment_provider_method, stripe_token_id, stripe_token_response, stripe_charge_response)
      SELECT orders.id, 'CHARGE', (orders.stripe_charge_response->>'amount')::int, 'EUR', 'STRIPE', 'STRIPE_CHARGE', orders.stripe_token_id, orders.stripe_token_response, orders.stripe_charge_response
      FROM orders
      WHERE orders.stripe_token_id IS NOT NULL AND orders.promotion_code IS NULL
    `))
    // Move all stripe charges with promotion code usage
    .then(() => knex.raw(`
      INSERT INTO payments (order_id, type, amount, currency, payment_provider, payment_provider_method, stripe_token_id, stripe_token_response, stripe_charge_response)
      SELECT orders.id, 'CHARGE', (orders.stripe_charge_response->>'amount')::int, 'EUR', 'STRIPE', 'STRIPE_CHARGE', orders.stripe_token_id, orders.stripe_token_response, orders.stripe_charge_response
      FROM orders
      WHERE orders.stripe_token_id IS NOT NULL AND orders.promotion_code IS NOT NULL
    `))
    .then(() => knex.raw(`
      INSERT INTO payments (order_id, type, amount, currency, payment_provider, promotion_id)
      SELECT
        orders.id,
        'CHARGE',
        (SELECT SUM(customer_unit_price_value * quantity) + CASE WHEN orders.production_class = 'HIGH' THEN 1500 ELSE 0 END FROM ordered_posters WHERE ordered_posters.order_id = orders.id) -
        (orders.stripe_charge_response->>'amount')::int,
        'EUR',
        'PROMOTION',
        (SELECT id FROM promotions WHERE promotions.promotion_code = orders.promotion_code)
      FROM orders
      WHERE orders.stripe_token_id IS NOT NULL AND orders.promotion_code IS NOT NULL
    `))
    // Move all 100% promotion purchases
    .then(() => knex.raw(`
      INSERT INTO payments (order_id, type, amount, currency, payment_provider, promotion_id)
      SELECT
        orders.id,
        'CHARGE',
        (
          SELECT SUM(customer_unit_price_value * quantity) + CASE WHEN orders.production_class = 'HIGH' THEN 1500 ELSE 0 END
          FROM ordered_posters
          WHERE ordered_posters.order_id = orders.id
        ),
        'EUR',
        'PROMOTION',
        (SELECT id FROM promotions WHERE promotions.promotion_code = orders.promotion_code)
      FROM orders
      WHERE orders.stripe_token_id IS NULL
    `))
    .then(() => knex.schema.table('orders', (table) => {
      table.dropColumn('stripe_token_id');
      table.dropColumn('stripe_token_response');
      table.dropColumn('stripe_charge_response');
      table.dropColumn('promotion_code');

      // Integer, value as in Stripe
      table.integer('customer_price_value');
      table.string('price_currency', 16);

      // When a promotion code is used
      table.bigInteger('promotion_id').index();
      table.foreign('promotion_id')
        .references('id')
        .inTable('promotions')
        .onDelete('RESTRICT')
        .onUpdate('RESTRICT');
    }))
    // Calculate order values
    .then(() => knex.raw(`
      UPDATE orders
      SET
        customer_price_value = (
          SELECT
            SUM(customer_unit_price_value * quantity) + CASE WHEN orders.production_class = 'HIGH' THEN 1500 ELSE 0 END
          FROM ordered_posters
          WHERE ordered_posters.order_id = orders.id
        ),
        price_currency = 'EUR'
    `))
    // There was one order in the history where we had moved the ordered posters to another order
    // This action left one order in the database which doesn't have any products(posters) attached
    .then(() => knex.raw(`
      UPDATE orders
      SET
        customer_price_value = (SELECT SUM(amount) FROM payments WHERE payments.order_id = orders.id AND payments.type = 'CHARGE'),
        price_currency = 'EUR'
      WHERE customer_price_value IS NULL
    `))
    .then(() => knex.raw('ALTER TABLE orders ALTER COLUMN customer_price_value SET NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER COLUMN price_currency SET NOT NULL'))
    .then(() => knex.raw(`
      UPDATE orders
      SET
        promotion_id = payments.promotion_id
      FROM payments
      WHERE orders.id = payments.order_id
      AND payments.promotion_id IS NOT NULL
    `))
    .then(() => knex.schema.renameTable('webhook_events', 'order_events'))
    .then(() => knex.schema.table('order_events', (table) => {
      table.string('source', 64);
    }))
    .then(() => knex.raw('UPDATE order_events SET source=\'PRINTMOTOR\''))
    .then(() => knex.raw('ALTER TABLE order_events ALTER COLUMN source SET NOT NULL'))
    // Assert that we have correct results
    .then(() => knex.raw(`
      SELECT
        orders.customer_price_value,
        (SELECT SUM(amount) FROM payments WHERE payments.order_id = orders.id AND payments.type = 'CHARGE'),
        *
      FROM orders
      WHERE orders.customer_price_value != (SELECT SUM(amount) FROM payments WHERE payments.order_id = orders.id AND payments.type = 'CHARGE')
    `))
    .then(({ rows }) => {
      if (rows.length > 0) {
        console.error(rows);
        throw new Error(`Found ${rows.length} orders where payments don't match the order value!`);
      }
    })
};

exports.down = (knex) => {
  return Promise.resolve()
    .then(() => knex.schema.table('orders', (table) => {
      table.string('stripe_token_id', 64).unique().index();
      table.jsonb('stripe_token_response');
      table.jsonb('stripe_charge_response');
      table.string('promotion_code', 512);
      table.dropColumn('customer_price_value');
      table.dropColumn('price_currency');
    }))
    // Move gift orders charges
    .then(() => knex.raw(`
      UPDATE orders
      SET
        promotion_code = (SELECT promotion_code FROM promotions WHERE id = orders.promotion_id)
      WHERE orders.promotion_id IS NOT NULL
    `))
    .then(() => knex.schema.table('orders', (table) => {
      table.dropColumn('promotion_id');
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
    .then(() => knex.schema.dropTable('payments'))
    .then(() => knex.schema.table('order_events', (table) => {
      table.dropColumn('source');
    }))
    .then(() => knex.schema.renameTable('order_events', 'webhook_events'));
};

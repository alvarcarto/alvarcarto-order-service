exports.up = function(knex) {
  return Promise.resolve()
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_token_id DROP NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_token_response DROP NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_charge_response DROP NOT NULL'));
};

// Warning: this down migration had to be updated because after this, orders were allowed
// to be made with promotion codes.
exports.down = function(knex) {
  return Promise.resolve()
    // Delete all orders paid with only promotion code
    .then(() => knex.raw(`
      DELETE FROM ordered_posters
      WHERE order_id IN (SELECT id FROM orders WHERE stripe_token_id IS NULL)
    `))
    .then(() => knex.raw(`
      DELETE FROM addresses
      WHERE order_id IN (SELECT id FROM orders WHERE stripe_token_id IS NULL)
    `))
    .then(() => knex.raw('DELETE FROM orders WHERE stripe_token_id IS NULL'))

    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_token_id SET NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_token_response SET NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_charge_response SET NOT NULL'));
};

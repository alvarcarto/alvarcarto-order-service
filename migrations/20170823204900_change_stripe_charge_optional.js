exports.up = function(knex, Promise) {
  return Promise.resolve()
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_token_id DROP NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_token_response DROP NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_charge_response DROP NOT NULL'));
};

exports.down = function(knex, Promise) {
  return Promise.resolve()
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_token_id SET NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_token_response SET NOT NULL'))
    .then(() => knex.raw('ALTER TABLE orders ALTER stripe_charge_response SET NOT NULL'));
};

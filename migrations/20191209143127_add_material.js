exports.up = function(knex) {
  return knex.schema.table('ordered_posters', function(table) {
    table.string('material');
  })
  .then(() =>
    knex.raw('UPDATE ordered_posters SET material=\'paper\'')
  )
  .then(() =>
    knex.raw('ALTER TABLE ordered_posters ALTER COLUMN material SET NOT NULL')
  );
};

exports.down = function(knex) {
  return knex.schema.table('ordered_posters', function(table) {
    table.dropColumn('material');
  });
};

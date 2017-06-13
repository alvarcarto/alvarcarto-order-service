exports.up = function(knex, Promise) {
  return knex.schema.table('ordered_posters', function(table) {
    table.string('poster_style');
  })
  .then(() =>
    knex.raw('UPDATE ordered_posters SET poster_style=\'bw\'')
  )
  .then(() =>
    knex.raw('ALTER TABLE ordered_posters ALTER COLUMN poster_style SET NOT NULL')
  );
};

exports.down = function(knex, Promise) {
  return knex.schema.table('ordered_posters', function(table) {
    table.dropColumn('poster_style');
  });
};

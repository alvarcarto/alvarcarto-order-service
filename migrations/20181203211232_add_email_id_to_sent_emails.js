const BPromise = require('bluebird');
const uuidv4 = require('uuid/v4');

exports.up = function(knex) {
  return knex.schema.table('sent_emails', function(table) {
    table.uuid('email_id');
  })
  .then(() =>
    knex.raw('SELECT * FROM sent_emails')
      .then(({ rows }) => {
        return BPromise.mapSeries(rows, (row) => {
          const randomUuid = uuidv4();
          return knex.raw(`UPDATE sent_emails SET email_id='${randomUuid}' WHERE id=${row.id}`);
        });
      })
  )
  .then(() =>
    knex.raw('ALTER TABLE sent_emails ALTER COLUMN email_id SET NOT NULL')
  );
};

exports.down = function(knex) {
  return knex.schema.table('sent_emails', function(table) {
    table.dropColumn('email_id');
  });
};

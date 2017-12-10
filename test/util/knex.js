const BPromise = require('bluebird');
const { config, knex } = require('../../src/util/database');

function migrateAllDownAndUp() {
  return migrateAllDown()
    .then(() => knex.migrate.latest(config));
}

function migrateAllDown() {
  const promise = knex.migrate.currentVersion();
  return promise.then((version) => {
    if (version !== 'none') {
      return knex.migrate.rollback()
        .then(() => migrateAllDown());
    }

    return BPromise.resolve();
  });
}

function runSeeds() {
  return knex.seed.run(config);
}

module.exports = {
  migrateAllDownAndUp,
  migrateAllDown,
  runSeeds,
  knex,
  knexConfig: config,
};

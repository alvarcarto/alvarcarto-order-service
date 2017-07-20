const util = require('../src/util/seeds');

exports.seed = function(knex, Promise) {
  return util.insertOrUpdate(knex, 'promotions', {
    id: 1,
    type: 'FIXED',
    promotion_code: 'FIXED5',
    label: '-5€',
    value: 500,
  })
  .then(() => util.insertOrUpdate(knex, 'promotions', {
    id: 2,
    type: 'PERCENTAGE',
    promotion_code: 'PERCENTAGE20',
    label: '-20%',
    value: 0.2,
  }))
  .then(() => util.insertOrUpdate(knex, 'promotions', {
    id: 3,
    type: 'PERCENTAGE',
    promotion_code: 'PERCENTAGE100',
    label: '-100%',
    value: 1.0,
  }));
};

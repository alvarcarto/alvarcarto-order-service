const _ = require('lodash');
const moment = require('moment');
const { knex } = require('../util/database');

function getPromotion(code) {
  return knex.raw(`
    SELECT
      promotions.created_at as created_at,
      promotions.type as type,
      promotions.promotion_code as promotion_code,
      promotions.value as value
    FROM promotions
    WHERE
      promotion_code = :code
  `, { code })
    .then((result) => {
      if (_.isEmpty(result.rows)) {
        return null;
      }

      return _rowToPromotionObject(result.rows[0]);
    });
}

function _rowToPromotionObject(row) {
  return {
    type: row.type,
    value: row.value,
    promotionCode: row.promotion_code,
    createdAt: moment(row.created_at),
  };
}

module.exports = {
  getPromotion,
};

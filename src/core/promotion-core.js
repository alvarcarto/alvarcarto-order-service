const _ = require('lodash');
const moment = require('moment');
const { knex } = require('../util/database');

function getPromotion(code) {
  if (!code) {
    return null;
  }

  return knex.raw(`
    SELECT
      promotions.id as id,
      promotions.type as type,
      promotions.value as value,
      promotions.currency as currency,
      promotions.promotion_code as promotion_code,
      promotions.label as label,
      promotions.expires_at as expires_at,
      promotions.usage_count as usage_count,
      promotions.max_allowed_usage_count as max_allowed_usage_count,
      promotions.created_at as created_at,
      promotions.updated_at as updated_at
    FROM promotions
    WHERE
      promotion_code = :code
  `, { code: code.toUpperCase() })
    .then((result) => {
      if (_.isEmpty(result.rows)) {
        return null;
      }

      return _rowToPromotionObject(result.rows[0]);
    });
}

function increasePromotionUsageCount(code) {
  return knex.raw(`
    UPDATE promotions
      SET usageCount = usageCount + 1
    WHERE
      promotion_code = :code
  `, { code: code.toUpperCase() });
}

function _rowToPromotionObject(row) {
  const obj = {
    id: row.id,
    type: row.type,
    value: row.value,
    currency: row.currency,
    promotionCode: row.promotion_code,
    label: row.label,
    usageCount: row.usage_count,
    maxAllowedUsageCount: row.max_allowed_usage_count,
    updatedAt: moment(row.updated_at),
    createdAt: moment(row.created_at),
  };

  if (row.expires_at) {
    obj.expiresAt = moment(row.expires_at);
  }

  obj.hasExpired = _hasPromotionExpired(obj);

  return _.pick(obj, [
    'type',
    'value',
    'label',
    'hasExpired',
    'currency',
    'promotionCode',
    'createdAt',
  ]);
}

function _hasPromotionExpired(obj) {
  const usedMaxTimes = _.isFinite(obj.maxAllowedUsageCount) &&
                       obj.usageCount >= obj.maxAllowedUsageCount;

  // expiry           now
  // ----------------------------> time
  //
  // means that `now - expiry` will be positive
  const hasTimeExpired = !_.isNil(obj.expiresAt) && moment().diff(obj.expiresAt) >= 0;
  return usedMaxTimes || hasTimeExpired;
}

module.exports = {
  getPromotion,
  increasePromotionUsageCount,
};

const BPromise = require('bluebird');
const _ = require('lodash');
const { moment } = require('../util/moment');
const { knex } = require('../util/database');

function getPromotions() {
  return knex.raw(`
    SELECT
      promotions.id as id,
      promotions.type as type,
      promotions.value as value,
      promotions.currency as currency,
      promotions.promotion_code as promotion_code,
      promotions.label as label,
      promotions.expires_at as expires_at,
      promotions.description as description,
      (SELECT COUNT(*) FROM payments WHERE payments.promotion_id = promotions.id) as usage_count,
      promotions.max_allowed_usage_count as max_allowed_usage_count,
      promotions.created_at as created_at,
      promotions.updated_at as updated_at
    FROM promotions
    ORDER BY id
  `)
    .then((result) => {
      return _.map(result.rows, row => _rowToPromotionObject(row, { allFields: true }));
    });
}

function getPromotion(code) {
  if (!code) {
    return BPromise.resolve(null);
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
      (SELECT COUNT(*) FROM payments WHERE payments.promotion_id = promotions.id) as usage_count,
      promotions.description as description,
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

function createPromotion(promotion) {
  return knex('promotions').insert({
    type: promotion.type,
    value: promotion.value,
    currency: promotion.currency,
    promotion_code: promotion.promotionCode,
    label: promotion.label,
    expires_at: promotion.expiresAt,
    max_allowed_usage_count: promotion.maxAllowedUsageCount,
    description: promotion.description,
  })
    .returning('*')
    .then((rows) => {
      return _rowToPromotionObject(rows[0]);
    });
}

function _rowToPromotionObject(row, opts = {}) {
  const obj = {
    id: row.id,
    type: row.type,
    value: row.value,
    currency: row.currency,
    promotionCode: row.promotion_code,
    label: row.label,
    description: row.description,
    usageCount: Number(row.usage_count),
    maxAllowedUsageCount: row.max_allowed_usage_count,
    updatedAt: moment(row.updated_at),
    createdAt: moment(row.created_at),
  };

  if (row.expires_at) {
    obj.expiresAt = moment(row.expires_at);
  }

  obj.hasExpired = _hasPromotionExpired(obj);
  if (opts.allFields) {
    return obj;
  }

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
  const usedMaxTimes = _.isFinite(obj.maxAllowedUsageCount)
                       && obj.usageCount >= obj.maxAllowedUsageCount;

  // expiry           now
  // ----------------------------> time
  //
  // means that `now - expiry` will be positive
  const hasTimeExpired = !_.isNil(obj.expiresAt) && moment().diff(obj.expiresAt) >= 0;
  return usedMaxTimes || hasTimeExpired;
}

module.exports = {
  getPromotion,
  createPromotion,
  getPromotions,
};

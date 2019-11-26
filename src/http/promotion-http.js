const ex = require('../util/express');
const promotionCore = require('../core/promotion-core');

const getPromotions = ex.createJsonRoute(() => {
  return promotionCore.getPromotions();
});

const postPromotion = ex.createJsonRoute((req) => {
  const promotion = {
    type: req.body.type,
    value: req.body.value,
    currency: req.body.currency,
    promotionCode: req.body.promotionCode,
    label: req.body.label,
    expiresAt: req.body.expiresAt,
    usageCount: req.body.usageCount,
    maxAllowedUsageCount: req.body.maxAllowedUsageCount,
    description: req.body.description,
  };
  return promotionCore.createPromotion(promotion);
});

const getPromotion = ex.createJsonRoute((req) => {
  const code = String(req.params.promotionCode).toUpperCase();
  return promotionCore.getPromotion(code)
    .then((promotion) => {
      if (!promotion) {
        return ex.throwStatus(404, 'Promotion not found');
      }

      const throwIfExpired = req.query.expiredAsOk === 'false';
      if (throwIfExpired && promotion.hasExpired) {
        return ex.throwStatus(404, 'Promotion not found');
      }

      return promotion;
    });
});

const getCurrentPromotion = ex.createJsonRoute(() => {
  return promotionCore.getCurrentPromotion()
    .then((promotion) => {
      if (!promotion) {
        return ex.throwStatus(404, 'Promotion not found');
      }

      return promotion;
    });
});

module.exports = {
  getPromotion,
  getCurrentPromotion,
  postPromotion,
  getPromotions,
};

const ex = require('../util/express');
const promotionCore = require('../core/promotion-core');

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

module.exports = {
  getPromotion,
};

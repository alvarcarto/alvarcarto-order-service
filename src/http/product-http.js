const ex = require('../util/express');
const productCore = require('../core/product-core');

const getCities = ex.createJsonRoute((req) => {
  return productCore.getCloseCities(Number(req.query.lat), Number(req.query.lng));
});

module.exports = {
  getCities,
};

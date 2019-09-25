const _ = require('lodash');
const ROLES = require('../enums/roles');
const config = require('../config');

const validTokens = config.API_KEY.split(',');

const injectApiKeyUser = () => (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (_.includes(validTokens, apiKey)) {
    // eslint-disable-next-line
    req.user = {
      role: ROLES.ADMIN,
    };
  } else {
    // eslint-disable-next-line
    req.user = {
      role: ROLES.ANONYMOUS,
    };
  }

  return next();
};

module.exports = injectApiKeyUser;

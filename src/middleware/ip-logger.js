const logger = require('../util/logger')(__filename);

const ipLogger = () => function logIps(req, res, next) {
  const reqId = req.headers['x-request-id'] || '0';
  logger.info(`Request ${reqId}: original client IP ${req.ip}`);
  return next();
};

module.exports = ipLogger;

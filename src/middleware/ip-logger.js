const ipLogger = () => function logIps(req, res, next) {
  const reqId = req.headers['x-request-id'] || '0';
  console.log(`Request ${reqId}: original client IP ${req.ip}`);
  return next();
};

module.exports = ipLogger;

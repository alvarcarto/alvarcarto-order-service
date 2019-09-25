const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const compression = require('compression');
const cors = require('cors');
const logger = require('./util/logger')(__filename);
const errorResponder = require('./middleware/error-responder');
const ipLogger = require('./middleware/ip-logger');
const errorLogger = require('./middleware/error-logger');
const requireHttps = require('./middleware/require-https');
const injectApiKeyUser = require('./middleware/inject-api-key-user');
const { createJsonRouter, createRawRouter } = require('./router');
const config = require('./config');

function createApp() {
  const app = express();
  // App is served behind Heroku's router and CloudFlare proxy.
  // This is needed to be able to use req.ip or req.secure
  app.enable('trust proxy', 2);
  app.disable('x-powered-by');

  if (!config.ALLOW_HTTP) {
    logger.info('All requests require HTTPS.');
    app.use(requireHttps());
  } else {
    logger.info('ALLOW_HTTP=true, unsafe requests are allowed. Don\'t use this in production.');
  }

  if (config.IP_LOGGER) {
    app.use(ipLogger());
  }

  if (config.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  }

  const corsOpts = {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  };
  logger.info('Using CORS options:', corsOpts);
  app.use(cors(corsOpts));
  app.use(compression({
    // Compress everything over 10 bytes
    threshold: 10,
  }));

  // Add req.user object
  app.use(injectApiKeyUser());

  // Stripe lib needs the raw body for signature verification
  const rawRouter = createRawRouter();
  app.use('/', rawRouter);

  // Initialize routes
  const jsonRouter = createJsonRouter();
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use('/', jsonRouter);

  app.use(errorLogger());
  app.use(errorResponder());

  return app;
}

module.exports = createApp;

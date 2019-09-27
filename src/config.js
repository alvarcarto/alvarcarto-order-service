/* eslint-disable no-process-env */
const {
  loadEnvs,
  getRequiredEnv,
  getOptionalEnv,
  string,
  boolean,
  number,
} = require('./util/env')
require('./configure-moment');

loadEnvs();

const config = {
  API_KEY: getRequiredEnv('API_KEY', string),
  DATABASE_URL: getRequiredEnv('DATABASE_URL', string),
  LOG_ENCRYPT_KEY: getRequiredEnv('LOG_ENCRYPT_KEY', string),
  // Printmotor hostname without any url details
  PRINTMOTOR_HOST: getRequiredEnv('PRINTMOTOR_HOST', string),
  PRINTMOTOR_USER: getRequiredEnv('PRINTMOTOR_USER', string),
  PRINTMOTOR_PASSWORD: getRequiredEnv('PRINTMOTOR_PASSWORD', string),
  PRINTMOTOR_SERVICE_ID: getRequiredEnv('PRINTMOTOR_SERVICE_ID', string),
  RENDER_API_URL: getRequiredEnv('RENDER_API_URL', string),
  RENDER_API_KEY: getRequiredEnv('RENDER_API_KEY', string),
  AWS_ACCESS_KEY_ID: getRequiredEnv('AWS_ACCESS_KEY_ID', string),
  AWS_SECRET_ACCESS_KEY: getRequiredEnv('AWS_SECRET_ACCESS_KEY', string),
  AWS_S3_BUCKET_NAME: getRequiredEnv('AWS_S3_BUCKET_NAME', string),
  STRIPE_SECRET_KEY: getRequiredEnv('STRIPE_SECRET_KEY', string),
  STRIPE_WEBHOOK_SECRET: getRequiredEnv('STRIPE_WEBHOOK_SECRET', string),

  // Optionals
  PORT: getOptionalEnv('PORT', number, 3001),
  NODE_ENV: getOptionalEnv('NODE_ENV', string, 'development'),
  LOG_LEVEL: getOptionalEnv('LOG_LEVEL', string, 'info'),
  CORS_ORIGIN: getOptionalEnv('CORS_ORIGIN', string, 'http://localhost:3000'),
  ALLOW_HTTP: getOptionalEnv('ALLOW_HTTP', boolean, false),
  DELIVERY_IS_LATE_BUSINESS_DAYS: getOptionalEnv('DELIVERY_IS_LATE_BUSINESS_DAYS', number, 4),
  ALLOW_UNVERIFIED_WEBHOOKS: getOptionalEnv('ALLOW_UNVERIFIED_WEBHOOKS', boolean, false),
  STRIPE_ALLOW_TEST_WEBHOOK_EVENTS: getOptionalEnv('STRIPE_ALLOW_TEST_WEBHOOK_EVENTS', boolean, false),
  IP_LOGGER: getOptionalEnv('IP_LOGGER', boolean, false),
  AWS_DEBUG: getOptionalEnv('AWS_DEBUG', boolean, false),
  AWS_REGION: getOptionalEnv('AWS_REGION', string, 'eu-west-1'),
  KNEX_DEBUG: getOptionalEnv('KNEX_DEBUG', boolean, false),
  MOCK_EMAIL: getOptionalEnv('MOCK_EMAIL', boolean, false),
  SKIP_S3_POSTER_UPLOAD: getOptionalEnv('SKIP_S3_POSTER_UPLOAD', boolean, false),
  // Use personal email as a fallback to prevent accidental spam
  PRINTMOTOR_SUPPORT_EMAIL: getOptionalEnv('PRINTMOTOR_SUPPORT_EMAIL', string, 'kimmo.brunfeldt@alvarcarto.com'),
  CREDIT_CARD_STATEMENT_NAME: getOptionalEnv('CREDIT_CARD_STATEMENT_NAME', string, 'alvarcarto.com'),
  SEND_TO_PRODUCTION_AFTER: getOptionalEnv('SEND_TO_PRODUCTION_AFTER', string, '3 hours'),
};

if (!config.ALLOW_UNVERIFIED_WEBHOOKS) {
  config.PRINTMOTOR_WEBHOOK_HMAC_SECRET = getRequiredEnv('PRINTMOTOR_WEBHOOK_HMAC_SECRET', string);
} else {
  config.PRINTMOTOR_WEBHOOK_HMAC_SECRET = getOptionalEnv('PRINTMOTOR_WEBHOOK_HMAC_SECRET', string, undefined);
}

if (!config.MOCK_EMAIL) {
  config.POSTMARK_API_KEY = getRequiredEnv('POSTMARK_API_KEY', string);
} else {
  config.POSTMARK_API_KEY = getOptionalEnv('POSTMARK_API_KEY', string, undefined);
}

module.exports = config;

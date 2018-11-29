/* eslint-disable no-process-env */
const requireEnvs = require('./util/require-envs');
require('./configure-moment');

requireEnvs([
  'API_KEY',
  'DATABASE_URL',
  'RENDER_API_KEY',
  'STRIPE_SECRET_KEY',
  'LOG_ENCRYPT_KEY',
  'PRINTMOTOR_HOST',
  'PRINTMOTOR_USER',
  'PRINTMOTOR_PASSWORD',
  'PRINTMOTOR_SERVICE_ID',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET_NAME',
]);

// Env vars should be casted to correct types
const config = {
  API_KEY: process.env.API_KEY,
  PORT: Number(process.env.PORT) || 9000,
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  ALLOW_HTTP: process.env.ALLOW_HTTP === 'true',
  ALLOW_UNVERIFIED_WEBHOOKS: process.env.ALLOW_UNVERIFIED_WEBHOOKS === 'true',
  IP_LOGGER: process.env.IP_LOGGER === 'true',
  LOG_ENCRYPT_KEY: process.env.LOG_ENCRYPT_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  POSTMARK_API_KEY: process.env.POSTMARK_API_KEY,
  // Printmotor hostname without any url details
  PRINTMOTOR_HOST: process.env.PRINTMOTOR_HOST || 'test.printmotor.io',
  PRINTMOTOR_USER: process.env.PRINTMOTOR_USER,
  PRINTMOTOR_PASSWORD: process.env.PRINTMOTOR_PASSWORD,
  PRINTMOTOR_SERVICE_ID: process.env.PRINTMOTOR_SERVICE_ID,
  PRINTMOTOR_WEBHOOK_HMAC_SECRET: process.env.PRINTMOTOR_WEBHOOK_HMAC_SECRET,
  RENDER_API_URL: process.env.RENDER_API_URL || 'http://51.255.81.67:8001',
  RENDER_API_KEY: process.env.RENDER_API_KEY,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
  AWS_REGION: process.env.AWS_REGION || 'eu-west-1',
  AWS_DEBUG: process.env.AWS_DEBUG === 'true',
  SEND_TO_PRODUCTION_AFTER: process.env.SEND_TO_PRODUCTION_AFTER || '3 hours',
  CREDIT_CARD_STATEMENT_NAME: process.env.CREDIT_CARD_STATEMENT_NAME || 'alvarcarto.com',
  MOCK_EMAIL: process.env.MOCK_EMAIL === 'true',
  SKIP_S3_POSTER_UPLOAD: process.env.SKIP_S3_POSTER_UPLOAD === 'true',

  // Use personal email as a fallback to prevent accidental spam
  PRINTMOTOR_SUPPORT_EMAIL: process.env.PRINTMOTOR_SUPPORT_EMAIL || 'kimmo.brunfeldt@alvarcarto.com',
};

if (!config.ALLOW_UNVERIFIED_WEBHOOKS) {
  requireEnvs(['PRINTMOTOR_WEBHOOK_HMAC_SECRET']);
}

if (!config.MOCK_EMAIL) {
  requireEnvs(['POSTMARK_API_KEY']);
}

if (process.env.DELIVERY_IS_LATE_BUSINESS_DAYS) {
  config.DELIVERY_IS_LATE_BUSINESS_DAYS = Number(process.env.DELIVERY_IS_LATE_BUSINESS_DAYS);
} else {
  config.DELIVERY_IS_LATE_BUSINESS_DAYS = 4;
}

module.exports = config;

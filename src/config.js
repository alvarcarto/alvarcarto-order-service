/* eslint-disable no-process-env */
const requireEnvs = require('./util/require-envs');

requireEnvs([
  'DATABASE_URL',
  'STRIPE_SECRET_KEY',
  'LOG_ENCRYPT_KEY',
]);

// Env vars should be casted to correct types
const config = {
  PORT: Number(process.env.PORT) || 9000,
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  ALLOW_HTTP: process.env.ALLOW_HTTP === 'true',
  IP_LOGGER: process.env.IP_LOGGER === 'true',
  LOG_ENCRYPT_KEY: process.env.LOG_ENCRYPT_KEY,
};

module.exports = config;

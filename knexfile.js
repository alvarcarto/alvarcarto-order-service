
const { URL } = require('url');
const fs = require('fs');
const pg = require('pg');
const path = require('path');
const config = require('./src/config')

const connectionUrl = new URL(config.DATABASE_URL)
connectionUrl.searchParams.append('charset', 'utf-8')

const disableCaVerify = process.env.DISABLE_RDS_CA_VERIFY === 'true';
if (config.NODE_ENV === 'production' && !disableCaVerify) {
  // Workaround to force "verify-ca" sslmode.
  pg.defaults.ssl = {
    rejectUnauthorized: true,
    ca: fs.readFileSync(path.join(__dirname, 'data/amazon-rds-ca-cert.pem')).toString(),
  };
}

const databaseConfig = {
  client: 'pg',
  connection: connectionUrl.href,
  pool: {
    min: 2,
    max: 10,
  },
  debug: config.DEBUG_KNEX,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'migrations'
  }
};

module.exports = databaseConfig;

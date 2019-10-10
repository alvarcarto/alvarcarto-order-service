/* eslint-disable no-process-env, no-console */

const path = require('path');
const { inspect } = require('util');
const fs = require('fs');
const _ = require('lodash');
const dotenv = require('dotenv');

function string(val) {
  return String(val);
}

function boolean(val, name) {
  if (val !== 'true' && val !== 'false') {
    throw new Error(`${name} is invalid. Non-boolean value found: ${inspect(val)}`);
  }

  return val === 'true';
}

function number(val, name) {
  const num = Number(val);
  if (!_.isFinite(num)) {
    throw new Error(`${name} is invalid. Non-number value found: ${inspect(val)}`);
  }
  return num;
}

function getRequiredEnv(name, castType) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`${name} environment variable is required`);
  }
  return castType(val, name);
}

function getOptionalEnv(name, castType, defaultVal) {
  const val = process.env[name];

  return _.isUndefined(val)
    ? defaultVal
    : castType(val, name);
}

function censorConnectionString(str) {
  const regex = /^([0-9A-Za-z]*):\/\/(.*):(.*)@(.*(:[0-9]*)?\/.*)$/;
  if (str.match(regex) !== null) {
    return str.replace(regex, '$1://$2:HIDDEN_PASSWORD@$4');
  }

  return 'CENSORED CONNECTION STRING';
}

let envsLoaded = false;
function loadEnvs() {
  if (envsLoaded) {
    return;
  }

  // By default, use development environment. This makes running e.g. knex migrations and
  // testing easier so you don't have to explicitly say "NODE_ENV=development knex ..."
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  const { NODE_ENV, CI } = process.env;

  // Map NODE_ENV to corresponding dotenv file
  const envFiles = {
    development: '.env',
    test: '.env.test',
  };

  if (NODE_ENV === 'production') {
    console.log('NODE_ENV=production, assuming env variables are set without dotenv ..');
  } else if (CI === 'true') {
    // In CI environment, we don't have an .env.test file in the file system,
    // so we are assuming that all corresponding environment variables are set in
    // the CI environment
    console.log('CI=true, assuming env variables are set without dotenv .. ');
  } else if (envFiles[NODE_ENV]) {
    // This is preventing a horror scenario where you have set DATABASE_URL to point into remote
    // environment such as production, and you are running tests which run migrations up and down
    const possiblyHorribleMistake = process.env.DATABASE_URL && process.env.REMOTE_DB !== 'true';
    if (possiblyHorribleMistake) {
      console.warn('\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.warn('Warning: DATABASE_URL env variable is defined in your shell');
      console.warn('Make sure it is not pointing to a remote environment accidentally.');
      console.warn('To remove this warning, run `unset DATABASE_URL` in your shell');
      console.warn('or use REMOTE_DB=true environment variable to ignore this warning');
      console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n');

      if (process.env.REMOTE_DB !== 'true') {
        throw new Error('DATABASE_URL is set manually. Run with `REMOTE_DB=true` if you really mean it.');
      }

      console.warn('REMOTE_DB=true, ignoring above warning!');
    }

    const filePath = path.join(__dirname, '../..', envFiles[NODE_ENV]);

    // This is only ran at process start, so it is ok to use sync method here
    if (!fs.existsSync(filePath)) {
      throw new Error(`Could not find env file from ${filePath}`);
    }

    console.log(`NODE_ENV=${NODE_ENV} Setting env variables from ${envFiles[NODE_ENV]} (${filePath})`);
    dotenv.config({ path: filePath });
  } else {
    throw new Error(`Unknown NODE_ENV value: ${NODE_ENV}`);
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL env var not set!');
  }
  console.log(`DATABASE_URL=${censorConnectionString(process.env.DATABASE_URL)}`);
  envsLoaded = true;
}

module.exports = {
  string,
  boolean,
  number,
  getRequiredEnv,
  getOptionalEnv,
  censorConnectionString,
  loadEnvs,
};

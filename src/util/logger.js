const path = require('path');
const winston = require('winston');
const _ = require('lodash');
const simpleEncryptor = require('simple-encryptor');
const config = require('../config');

const COLORIZE = config.NODE_ENV === 'development';

function createLogger(filePath) {
  const fileName = path.basename(filePath);

  const logger = new winston.Logger({
    transports: [new winston.transports.Console({
      colorize: COLORIZE,
      label: fileName,
      timestamp: true,
    })],
  });

  const encryptor = simpleEncryptor(config.LOG_ENCRYPT_KEY);
  logger.logEncrypted = function logEncrypted(level, plainText, secretObj) {
    logger[level](plainText, `ENCRYPTED(${encryptor.encrypt(secretObj)})`);
  };

  _setLevelForTransports(logger, config.LOG_LEVEL || 'info');
  return logger;
}

function _setLevelForTransports(logger, level) {
  _.each(logger.transports, function(transport) {
    transport.level = level;
  });
}

module.exports = createLogger;

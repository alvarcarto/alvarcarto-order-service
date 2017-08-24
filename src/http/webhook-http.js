const BPromise = require('bluebird');
const logger = require('../util/logger')(__filename);
const webhookCore = require('../core/webhook-core');

const postPrintmotor = ex.createJsonRoute((req) => {
  logger.logEncrypted('info', 'alert-1h Webhook called:', req.body);
  return webhookCore.savePrintmotorEvent(req.body);
});

module.exports = {
  postPrintmotor,
};
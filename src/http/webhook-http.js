const ex = require('../util/express');
const logger = require('../util/logger')(__filename);
const webhookCore = require('../core/webhook-core');

const postPrintmotor = ex.createJsonRoute((req) => {
  logger.logEncrypted('info', 'alert-1h Webhook called:', req.body);

  const incomingHmac = req.headers['x-printmotor-hmac-sha256'];
  return webhookCore.savePrintmotorEvent(req.body, incomingHmac)
    .then(() => ({ status: 'OK' }));
});

module.exports = {
  postPrintmotor,
};

const ex = require('../util/express');
const logger = require('../util/logger')(__filename);
const webhookCore = require('../core/webhook-core');

const postPrintmotor = ex.createJsonRoute((req) => {
  logger.logEncrypted('info', 'Webhook called:', req.body);

  const incomingHmac = req.headers['x-printmotor-hmac-sha256'];
  return webhookCore.savePrintmotorEvent(req.body, incomingHmac)
    .then(() => ({ status: 'OK' }));
});

const postOneflow = ex.createJsonRoute((req) => {
  logger.info('Oneflow webhook called:', req.body);
  logger.info('Headers:', req.headers);
});

const postStripe = ex.createJsonRoute((req) => {
  logger.info('Stripe webhook called:', req.body);
  logger.info('Headers:', req.headers);
});

module.exports = {
  postPrintmotor,
  postOneflow,
  postStripe,
};

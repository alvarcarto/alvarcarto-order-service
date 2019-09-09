const crypto = require('crypto');
const BPromise = require('bluebird');
const _ = require('lodash');
const { knex } = require('../util/database');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const emailCore = require('../core/email-core');
const config = require('../config');

function savePrintmotorEvent(payload, incomingHmac) {
  if (!config.ALLOW_UNVERIFIED_WEBHOOKS) {
    const isReal = _isRealEventSource(payload, incomingHmac);
    if (!isReal) {
      logger.logEncrypted('error', 'alert-critical Unverified webhook event', payload);
      const err = new Error('Incoming webhook request had incorrect HMAC');
      err.status = 401;
      throw err;
    }
  }

  return _saveEvent(payload)
    .then(() => _reactToEvent(payload))
    .catch((err) => {
      const printmotorOrderId = _.get(payload, 'userOrder.orderNumber');
      const alertPrefix = err.skipAlert ? '' : 'alert-critical ';
      const msg = `${alertPrefix}Could not process webhook event. Printmotor ID: ${printmotorOrderId}`;
      logger.logEncrypted('error', msg, payload);
      throw err;
    });
}

function _saveEvent(payload) {
  const { eventType, userOrder } = payload;
  const printmotorId = String(userOrder.orderNumber);
  return knex('orders')
    .select('id')
    .where({ printmotor_order_id: printmotorId })
    .then((rows) => {
      if (!_.isArray(rows) || rows.length === 0) {
        const msg = `Order not found with printmotor id: ${printmotorId}`;
        logger.logEncrypted('warn', msg, payload);
        const err = new Error(msg);
        err.skipAlert = true;
        throw err;
      }

      return knex('webhook_events')
        .insert({
          order_id: rows[0].id,
          event: eventType,
          payload,
        });
    });
}

function _isRealEventSource(payload, incomingHmac) {
  const hmac = crypto.createHmac('sha256', config.PRINTMOTOR_WEBHOOK_HMAC_SECRET);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('base64') === incomingHmac;
}

function _reactToEvent(payload) {
  const { eventType } = payload;

  if (_.has(reactions, eventType)) {
    return reactions[eventType](payload)
  }

  logger.logEncrypted('warn', `No reaction found for event type: ${eventType}, payload:`, payload);
  return BPromise.resolve();
}

const reactions = {
  USER_ORDER_DELIVERED: (payload) => {
    const trackingCode = _.get(payload, 'userOrder.meta.trackingCode');
    if (!trackingCode) {
      const err = new Error('No tracking code found from payload');
      err.status = 400;
      throw err;
    }

    const { userOrder } = payload;
    const printmotorId = String(userOrder.orderNumber);

    return knex('orders')
      .select('pretty_order_id')
      .where({ printmotor_order_id: printmotorId })
      .then((rows) => {
        const prettyOrderId = _.get(rows, '0.pretty_order_id');
        if (!prettyOrderId) {
          const msg = `Order not found with printmotor id: ${printmotorId}`;
          logger.logEncrypted('warn', msg, payload);
          const err = new Error(msg);
          err.skipAlert = true;
          throw err;
        }

        return BPromise.props({
          order: orderCore.getOrder(prettyOrderId, { allFields: true }),
          prettyOrderId,
        });
      })
      .then(({ order, prettyOrderId }) => {
        if (!order) {
          throw new Error(`Order not found with pretty id: ${prettyOrderId}`);
        }

        return BPromise.props({
          rows: knex('webhook_events')
            .select('*')
            .where({
              order_id: knex.raw('(SELECT id FROM orders WHERE printmotor_order_id = ?)', [printmotorId]),
              event: 'USER_ORDER_DELIVERED',
            }),
          order,
        });
      })
      .tap(({ order, rows }) => {
        if (_.isArray(rows) && rows.length > 1) {
          throw new Error('USER_ORDER_DELIVERED called multiple times');
        }

        const link = _.get(userOrder, 'meta.externalTrackingLinks.0.absoluteUrl');
        if (!link) {
          const err = new Error('No tracking url found from webhook payload');
          err.status = 400;
          throw err;
        }

        const trackingInfo = {
          code: _.get(userOrder, 'meta.trackingCode'),
          url: link,
        };

        return emailCore.sendDeliveryStarted(order, trackingInfo);
      });
  },
};

module.exports = {
  savePrintmotorEvent,
};

const BPromise = require('bluebird');
const _ = require('lodash');
const { knex } = require('../util/database');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const emailCore = require('../core/email-core');

function savePrintmotorEvent(payload) {
  return _saveEvent(payload)
    .then(() => _reactToEvent(payload))
    .catch((err) => {
      logger.logEncrypted('error', 'alert-1h Could not process webhook event', payload);
      throw err;
    });
}

function _saveEvent(payload) {
  const { eventType, userOrder } = payload;
  const printmotorId = String(userOrder.orderNumber);
  return knex('webhook_events')
    .insert({
      order_id: knex.raw('(SELECT id FROM orders WHERE printmotor_order_id = ?)', [printmotorId]),
      event: eventType,
      payload,
    });
}

function _reactToEvent(payload) {
  const { eventType } = payload;

  if (_.has(reactions, eventType)) {
    return reactions[eventType](payload)
      .catch((err) => {
        logger.logEncrypted('error', 'alert-1h Error reacting to webhook event:', payload);
        throw err;
      });
  }

  return BPromise.resolve();
}

const reactions = {
  USER_ORDER_DELIVERED: (payload) => {
    const trackingCode = _.get(payload, 'userOrder.meta.trackingCode');
    if (!trackingCode) {
      throw new Error('No tracking code found from payload');
    }

    const { eventType, userOrder } = payload;
    const printmotorId = String(userOrder.orderNumber);

    return knex('orders')
      .select('pretty_order_id')
      .where({ printmotor_order_id: printmotorId })
      .then((rows) => {
        const prettyOrderId = _.get(rows, '0.pretty_order_id');
        if (!prettyOrderId) {
          throw new Error(`Order not found with printmotor id: ${printmotorId}`);
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

        const link = _.get(userOrder, 'meta.externalTrackingLinks.0.absoluteUrl');
        if (!link) {
          throw new Error('No tracking url found from webhook payload');
        }

        const trackingInfo = {
          code: _.get(userOrder, 'meta.trackingCode'),
          url: link,
        };

        return emailCore.sendDeliveryStarted(order, trackingInfo);
      });
  }
};

module.exports = {
  savePrintmotorEvent,
};

const _ = require('lodash');

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
      order_id: knex.raw('SELECT id FROM orders WHERE printmotor_order_id = ?', [printmotorId]),
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
      .then((prettyOrderId) => {
        return orderCore.getOrder(prettyOrderId, { allFields: true });
      })
      .then((order) => {
        const link = _.get(userOrder, 'meta.externalTrackingLinks.0');
        if (!link) {
          throw new Error('No tracking url found from webhook payload');
        }

        const trackingInfo = {
          code: userOrder.trackingCode,
          url: link,
        };

        return emailCore.sendDeliveryStarted(order, trackingInfo);
      });
  }
};

module.exports = {
  saveEvent,
};

const crypto = require('crypto');
const BPromise = require('bluebird');
const _ = require('lodash');
const { knex } = require('../util/database');
const logger = require('../util/logger')(__filename);
const orderCore = require('../core/order-core');
const emailCore = require('../core/email-core');
const config = require('../config');

// How many emails is maximum that we will send to our customers.
// Includes delivery-started and delivery-update emails
const MAX_DELIVERY_EMAILS = 3;

const reactions = {
  USER_ORDER_CREATED: (payload) => {
    const printmotorOrderId = _.get(payload, 'userOrder.orderNumber');
    logger.info(`Received webhook event USER_ORDER_CREATED for order ${printmotorOrderId}`);
    return BPromise.resolve();
  },

  USER_ORDER_CANCELLED: (payload) => {
    const printmotorOrderId = _.get(payload, 'userOrder.orderNumber');
    logger.info(`Received webhook event USER_ORDER_CREATED for order ${printmotorOrderId}`);
    return BPromise.resolve();
  },

  USER_ORDER_DELIVERED: async (payload) => {
    const trackingCode = _.get(payload, 'userOrder.meta.trackingCode');
    if (!trackingCode) {
      const err = new Error('No tracking code found from payload');
      err.status = 400;
      throw err;
    }

    const printmotorUserOrder = payload.userOrder;
    const printmotorId = String(printmotorUserOrder.orderNumber);

    const rows = await knex('orders')
      .select('pretty_order_id')
      .where({ printmotor_order_id: printmotorId });

    const prettyOrderId = _.get(rows, '0.pretty_order_id');
    if (!prettyOrderId) {
      const msg = `Pretty order id not found from printmotor id: ${printmotorId}`;
      logger.logEncrypted('warn', msg, payload);
      throw new Error(msg);
    }

    const order = await orderCore.getOrder(prettyOrderId, { allFields: true });

    if (!order) {
      throw new Error(`Order not found with pretty id: ${prettyOrderId}`);
    }

    const link = _.get(printmotorUserOrder, 'meta.externalTrackingLinks.0.absoluteUrl');
    if (!link) {
      const err = new Error('No tracking url found from webhook payload');
      err.status = 400;
      throw err;
    }

    const trackingInfo = {
      code: _.get(printmotorUserOrder, 'meta.trackingCode'),
      url: link,
    };

    const deliveryStartedSent = _.findIndex(
      order.sentEmails,
      mail => mail.type === 'delivery-started',
    ) !== -1;
    if (!deliveryStartedSent) {
      await emailCore.sendDeliveryStarted(order, trackingInfo);
      return;
    }

    const deliveryUpdates = _.filter(order.sentEmails, mail => mail.type === 'delivery-update');
    // Delivery started has been sent if we are here, so subtract 1 from max emails
    if (deliveryUpdates.length > (MAX_DELIVERY_EMAILS - 1)) {
      const msg = `Refusing to send over ${MAX_DELIVERY_EMAILS} emails (${prettyOrderId})`;
      logger.logEncrypted('error', msg, payload);
      throw new Error(msg);
    }

    await emailCore.sendDeliveryUpdate(order, trackingInfo);
  },
};

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

  const { userOrder } = payload;
  const printmotorId = String(userOrder.orderNumber);

  return _doesOrderWithPrintmotorIdExist(printmotorId)
    .then((orderExists) => {
      if (!orderExists) {
        // This usually means that we have manually created an order to Printmotor UI.
        const msg = `Order not found with printmotor id: ${printmotorId}`;
        logger.logEncrypted('warn', msg, payload);
        return BPromise.resolve();
      }

      return _saveEvent(payload)
        .then(() => _reactToEvent(payload));
    })
    .catch((err) => {
      const printmotorOrderId = _.get(payload, 'userOrder.orderNumber');
      const msg = `alert-critical Could not process webhook event. Printmotor ID: ${printmotorOrderId}. ${err}`;
      logger.logEncrypted('error', msg, payload);
      throw err;
    });
}

function _doesOrderWithPrintmotorIdExist(printmotorId) {
  return knex('orders')
    .select('id')
    .where({ printmotor_order_id: printmotorId })
    .then((rows) => {
      const doesOrderExist = _.isArray(rows) && rows.length > 0;
      return doesOrderExist;
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
        throw new Error(`Order not found with printmotor id: ${printmotorId}`);
      }

      if (rows.length > 1) {
        throw new Error(`More than one order found with printmotor id: ${printmotorId}`);
      }

      return knex('order_events')
        .insert({
          order_id: rows[0].id,
          source: 'PRINTMOTOR',
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
    return reactions[eventType](payload);
  }

  logger.logEncrypted('warn', `No reaction found for event type: ${eventType}, payload:`, payload);
  return BPromise.resolve();
}

module.exports = {
  savePrintmotorEvent,
};

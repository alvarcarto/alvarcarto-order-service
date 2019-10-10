const util = require('util');
const _ = require('lodash');
const { calculateItemPrice, calculateCartPrice } = require('alvarcarto-price-util');
const promiseRetryify = require('promise-retryify');
const BPromise = require('bluebird');
const { moment } = require('../util/moment');
const logger = require('../util/logger')(__filename);
const ADDRESS_TYPE = require('../enums/address-type');
const PAYMENT_TYPE = require('../enums/payment-type');
const PAYMENT_PROVIDER = require('../enums/payment-provider');
const PAYMENT_PROVIDER_METHOD = require('../enums/payment-provider-method');
const ORDER_EVENT_SOURCE = require('../enums/order-event-source');
const { knex } = require('../util/database');
const { resolveProductionClass, resolveShippingClass, createRandomOrderId } = require('../util');
const promotionCore = require('./promotion-core');
const printmotorCore = require('./printmotor-core');
const config = require('../config');
const { retryingSaveFailedOrder } = require('./fail-safe-core');
const { diffInWorkingDays } = require('../util/time');

function createOrder(order) {
  let fullOrder = _.merge({}, order, { prettyOrderId: 'NONE' });

  return knex.transaction(trx =>
    _createUniqueOrderId({ trx })
      .then((prettyOrderId) => {
        // Share to upper function scope to be able to log this
        fullOrder = _.merge({}, order, {
          prettyOrderId,
        });

        return _createOrder(fullOrder, { trx });
      })
      .tap(orderRow => _createOrderedPosters(orderRow.id, order.cart, { trx }))
      .tap(orderRow => _createOrderedGiftItems(orderRow.id, order.cart, { trx }))
      .tap((orderRow) => {
        if (!order.shippingAddress) {
          return BPromise.resolve();
        }

        const address = _.merge({}, order.shippingAddress, {
          type: ADDRESS_TYPE.SHIPPING,
        });
        return _createAddress(orderRow.id, address, { trx });
      })
      .tap((orderRow) => {
        if (!order.billingAddress) {
          return BPromise.resolve();
        }

        const address = _.merge({}, order.billingAddress, {
          type: ADDRESS_TYPE.BILLING,
        });
        return _createAddress(orderRow.id, address, { trx });
      })
      .then(() => getOrder(fullOrder.prettyOrderId, { trx }))
      .catch(_isUniqueConstraintError, err => _logUniqueConstraintErrorAndRethrow(err))
      .catch(err => _saveErrorInBackgroundAndRethrow(err, fullOrder))
  );
}

function getOrder(orderId, opts = {}) {
  const trx = opts.trx || knex;

  return selectOrders({
    addQuery: 'WHERE orders.pretty_order_id = :orderId',
    params: { orderId },
    trx,
  })
    .then((orders) => {
      if (_.isEmpty(orders)) {
        return BPromise.props({
          order: null,
          promotion: null,
        });
      }

      const order = orders[0];
      return BPromise.props({
        order,
        promotion: promotionCore.getPromotion(order.promotionCode),
      });
    })
    .then(({ order, promotion }) => {
      if (!order) {
        return null;
      }

      const fullOrder = _.merge({}, order, {
        promotion,
      });
      if (opts.allFields) {
        return fullOrder;
      }

      const partialOrder = {
        orderId: fullOrder.orderId,
        cart: fullOrder.cart,
        paid: fullOrder.paid,
        promotion: fullOrder.promotion,
        createdAt: fullOrder.createdAt,
      };
      if (fullOrder.shippingAddress) {
        partialOrder.shippingAddress = _.pick(fullOrder.shippingAddress, [
          'city',
          'countryCode',
        ]);
      }

      return _.omitBy(partialOrder, _.isNil);
    });
}

function getOrdersReadyToProductionBaseAddQuery() {
  return `WHERE orders.sent_to_production_at is NULL AND
    orders.created_at < NOW() - INTERVAL '${config.SEND_TO_PRODUCTION_AFTER}'
  `;
}

function getOrdersReadyToProduction(opts = {}) {
  const trx = opts.trx || knex;

  // TODO: Check if express shipping and then send the order immediately to printmotor
  return selectOrders({
    // Find orders where the full value has been paid
    addQuery: `${getOrdersReadyToProductionBaseAddQuery()} AND
      orders.customer_price_value -
        (SELECT SUM(amount) FROM payments WHERE payments.order_id = orders.id AND payments.type = '${PAYMENT_TYPE.CHARGE}') <= 0
    `,
    trx,
  });
}

function getPartiallyPaidOrders(opts = {}) {
  const trx = opts.trx || knex;

  return selectOrders({
    // Find orders where the whole amount is not paid, but there are one or more payments made
    addQuery: `${getOrdersReadyToProductionBaseAddQuery()} AND
      orders.customer_price_value - (SELECT SUM(amount) FROM payments WHERE payments.order_id = orders.id AND payments.type = '${PAYMENT_TYPE.CHARGE}') > 0 AND
      (SELECT COUNT(*) FROM payments WHERE payments.order_id = orders.id AND payments.type = '${PAYMENT_TYPE.CHARGE}') > 0
    `,
    trx,
  });
}

function getOrdersWithTooLongProductionTime(opts = {}) {
  const trx = opts.trx || knex;

  return trx.raw(`
    SELECT
      orders.id as order_id,
      orders.*
    FROM orders
    LEFT JOIN order_events
      ON orders.id = order_events.order_id
    LEFT JOIN sent_emails
      ON orders.id = sent_emails.order_id
    WHERE orders.sent_to_production_at IS NOT NULL
      -- 15 day limit so that we don't need to go through all orders in the history,
      -- this check is anyways ran in a regular interval so no order should "slip" from this
      -- time window
      AND orders.sent_to_production_at >= NOW() - INTERVAL '15' day
      AND orders.sent_to_production_at <= NOW() - INTERVAL '1' day
    GROUP BY orders.id
    HAVING MAX(CASE WHEN order_events.source='${ORDER_EVENT_SOURCE.PRINTMOTOR}' AND order_events.event='USER_ORDER_DELIVERED' THEN 1 ELSE 0 END) = 0
      -- and that we haven't received "user order cancelled" from printmotor yet
      AND MAX(CASE WHEN order_events.source='${ORDER_EVENT_SOURCE.PRINTMOTOR}' AND order_events.event='USER_ORDER_CANCELLED' THEN 1 ELSE 0 END) = 0
      -- and that we haven't yet sent the reminder to printmotor for the given order
      AND MAX(CASE WHEN sent_emails.type='delivery-reminder-to-printmotor' THEN 1 ELSE 0 END) = 0
    ORDER BY orders.id
  `)
    .then((result) => {
      const uniqueOrderRows = _.uniqBy(result.rows, row => row.order_id);

      const now = moment();
      const possiblyLateOrders = _.filter(uniqueOrderRows, (row) => {
        const orderDate = moment(row.created_at);
        const diffInDays = diffInWorkingDays(now, orderDate);
        const isLate = diffInDays > config.DELIVERY_IS_LATE_BUSINESS_DAYS;
        return isLate;
      });

      // These orders might still contain cancelled orders or already delivered orders
      // in case we haven't correctly received or saved the USER_ORDER_DELIVERED webhook
      return BPromise.filter(possiblyLateOrders, (order) => {
        return printmotorCore.getOrder(order.printmotor_order_id)
          .then((printmotorOrder) => {
            return printmotorCore.isOrderInProduction(printmotorOrder);
          });
      }, { concurrency: 1 });
    })
    .then((lateOrders) => {
      if (_.isArray(lateOrders) && lateOrders.length < 1) {
        return [];
      }

      const lateOrdersStr = _.map(lateOrders, 'id').join(', ');
      return selectOrders({
        addQuery: `WHERE orders.id IN (${lateOrdersStr})`,
        trx,
      });
    });
}

// opts.addQuery MUST BE SAFE INPUT, DO NOT USE USER INPUT FOR THAT VALUE
function selectOrders(_opts = {}) {
  const opts = _.merge({
    params: {},
  }, _opts);
  const trx = opts.trx || knex;

  return trx.raw(`
    SELECT
      orders.pretty_order_id as pretty_order_id,
      orders.created_at as order_created_at,
      orders.customer_email as customer_email,
      orders.email_subscription as email_subscription,
      addresses.person_name as shipping_person_name,
      addresses.street_address as shipping_street_address,
      addresses.street_address_extra as shipping_street_address_extra,
      addresses.city as shipping_city,
      addresses.postal_code as shipping_postal_code,
      addresses.country_code as shipping_country_code,
      addresses.state as shipping_state,
      addresses.contact_phone as shipping_contact_phone,
      sent_emails.id as sent_email_id,
      sent_emails.type as sent_email_type,
      sent_emails.created_at as sent_email_created_at,
      payments.id as payment_id,
      payments.type as payment_type,
      payments.amount as payment_amount,
      payments.currency as payment_currency,
      payments.payment_provider as payment_payment_provider,
      payments.payment_provider_method as payment_payment_provider_method,
      (SELECT promotion_code FROM promotions WHERE payments.promotion_id = promotions.id) as payment_promotion_code,
      payments.stripe_token_id as payment_stripe_token_id,
      payments.stripe_token_response as payment_stripe_token_response,
      payments.stripe_charge_response as payment_stripe_charge_response,
      payments.stripe_payment_intent_id as payment_stripe_payment_intent_id,
      payments.stripe_payment_intent_success_event as payment_stripe_payment_intent_success_event,
      payments.created_at as payment_created_at,
      promotions.promotion_code as promotion_code,
      (SELECT SUM(amount) FROM payments WHERE payments.order_id = orders.id AND payments.type = '${PAYMENT_TYPE.CHARGE}') as order_paid_amount,
      *
    FROM (
      SELECT
        ordered_posters.order_id as order_id,
        ordered_posters.id as ordered_poster_id,
        ordered_posters.quantity as quantity,
        ordered_posters.map_south_west_lat as map_south_west_lat,
        ordered_posters.map_south_west_lng as map_south_west_lng,
        ordered_posters.map_north_east_lat as map_north_east_lat,
        ordered_posters.map_north_east_lng as map_north_east_lng,
        ordered_posters.map_style as map_style,
        ordered_posters.poster_style as poster_style,
        ordered_posters.map_bearing as map_bearing,
        ordered_posters.map_pitch as map_pitch,
        ordered_posters.size as size,
        ordered_posters.orientation as orientation,
        ordered_posters.labels_enabled as labels_enabled,
        ordered_posters.label_header as label_header,
        ordered_posters.label_small_header as label_small_header,
        ordered_posters.label_text as label_text,
        ordered_posters.map_center_lat as map_center_lat,
        ordered_posters.map_center_lng as map_center_lng,
        ordered_posters.map_zoom as map_zoom,
        null as gift_item_id,
        null as gift_item_type,
        null as gift_item_quantity,
        null as gift_item_value
      FROM ordered_posters
      UNION ALL
      SELECT
        ordered_gift_items.order_id as order_id,
        null as ordered_poster_id,
        null as quantity,
        null as map_south_west_lat,
        null as map_south_west_lng,
        null as map_north_east_lat,
        null as map_north_east_lng,
        null as map_style,
        null as poster_style,
        null as map_bearing,
        null as map_pitch,
        null as size,
        null as orientation,
        null as labels_enabled,
        null as label_header,
        null as label_small_header,
        null as label_text,
        null as map_center_lat,
        null as map_center_lng,
        null as map_zoom,
        ordered_gift_items.id as gift_item_id,
        ordered_gift_items.type as gift_item_type,
        ordered_gift_items.quantity as gift_item_quantity,
        ordered_gift_items.value as gift_item_value
      FROM ordered_gift_items
    ) sub_query
    LEFT JOIN orders as orders
      ON orders.id = sub_query.order_id
    LEFT JOIN addresses as addresses
      ON addresses.order_id = orders.id AND addresses.type = 'SHIPPING'
    LEFT JOIN sent_emails as sent_emails
      ON sent_emails.order_id = orders.id
    LEFT JOIN payments as payments
      ON payments.order_id = orders.id
    LEFT JOIN promotions as promotions
      ON promotions.id = orders.promotion_id
    ${opts.addQuery}
  `, opts.params)
    .then(async (result) => {
      // Multiple rows might be returned per order, all ordered posters are own rows, and so are
      // sent emails
      const grouped = _.groupBy(result.rows, row => row.pretty_order_id);
      const arr = _.map(grouped, (rows, orderId) => ({ rows, orderId }));

      const orders = {};
      await BPromise.each(arr, async ({ rows, orderId }) => {
        const orderObj = await _rowsToOrderObject(rows);
        orders[orderId] = orderObj;
      });

      const uniqueOrderIds = _.uniq(_.keys(grouped));
      // Make sure the order of returned rows is not changed
      return _.map(uniqueOrderIds, orderId => orders[orderId]);
    });
}

function addEmailSent(orderId, email, opts = {}) {
  const trx = opts.trx || knex;

  return trx('sent_emails').insert({
    order_id: knex.raw('(SELECT id FROM orders WHERE pretty_order_id = :orderId)', { orderId }),
    email_id: email.emailId,
    type: email.type,
    to: email.to,
    cc: email.cc,
    subject: email.subject,
  })
    .returning('*')
    .then(rows => rows[0]);
}

async function createPayment(orderId, payment, opts = {}) {
  const trx = opts.trx || knex;

  if (!_.has(PAYMENT_TYPE, payment.type)) {
    throw new Error(`Unknown payment type: ${util.inspect(payment.type)}`);
  }

  if (!_.has(PAYMENT_PROVIDER, payment.paymentProvider)) {
    throw new Error(`Unknown payment provider: ${util.inspect(payment.paymentProvider)}`);
  }

  if (payment.paymentProviderMethod && !_.has(PAYMENT_PROVIDER_METHOD, payment.paymentProviderMethod)) {
    throw new Error(`Unknown payment provider method: ${util.inspect(payment.paymentProviderMethod)}`);
  }

  const insertObj = {
    order_id: knex.raw('(SELECT id FROM orders WHERE pretty_order_id = :orderId)', { orderId }),
    type: payment.type,
    payment_provider: payment.paymentProvider,
    payment_provider_method: payment.paymentProviderMethod,
    amount: payment.amount,
    currency: payment.currency,
    stripe_payment_intent_id: payment.stripePaymentIntentId,
    stripe_payment_intent_success_event: payment.stripePaymentIntentSuccessEvent,
  };

  if (payment.promotionCode) {
    insertObj.promotion_id = knex.raw('(SELECT id FROM promotions WHERE promotion_code = ?)', [payment.promotionCode]);
  }

  const res = await trx('payments').insert(insertObj);

  return res;
}

async function createOrderEvent(prettyOrderId, event, opts = {}) {
  const trx = opts.trx || knex;

  if (!_.has(ORDER_EVENT_SOURCE, event.source)) {
    throw new Error(`Unknown order event source: ${util.inspect(event.source)}`);
  }

  return trx('orders')
    .select('id')
    .where({ pretty_order_id: prettyOrderId })
    .then((rows) => {
      if (!_.isArray(rows) || rows.length === 0) {
        throw new Error(`Order not found with pretty order id: ${prettyOrderId}`);
      }

      return trx('order_events')
        .insert({
          order_id: knex.raw('(SELECT id FROM orders WHERE pretty_order_id = ?)', [prettyOrderId]),
          source: event.source,
          event: event.event,
          payload: event.payload,
        });
    });
}

function markOrderSentToProduction(orderId, printmotorOrderId, response, requestParams) {
  return knex.raw(`
    UPDATE orders
      SET sent_to_production_at = now(),
          printmotor_order_id = :printmotorOrderId,
          printmotor_order_request = :requestParams,
          printmotor_order_response = :printmotorResponse
    WHERE pretty_order_id = :orderId
  `, {
    orderId,
    printmotorOrderId,
    printmotorResponse: JSON.stringify(response),
    requestParams: JSON.stringify(requestParams),
  });
}

// Each cart item is its own row
async function _rowsToOrderObject(rows) {
  const onlyCartRows = _.filter(rows, (row) => {
    const isCartItemRow = row.ordered_poster_id !== null || row.gift_item_id !== null;
    return isCartItemRow;
  });

  // Take all unique ordered posters rows
  const uniqueCartRows = _.uniqBy(onlyCartRows, (row) => {
    if (row.ordered_poster_id !== null) {
      return `poster-${row.ordered_poster_id}`;
    } else if (row.gift_item_id !== null) {
      return `gift-item-${row.gift_item_id}`;
    }

    // This should not happen as we just filtered the rows above
    throw new Error(`Unknown type of cart row found: ${JSON.stringify(row)}`);
  });

  const cart = _.map(uniqueCartRows, (row) => {
    if (row.gift_item_id !== null) {
      return _.omitBy({
        id: row.gift_item_id,
        type: row.gift_item_type,
        quantity: row.gift_item_quantity,
        value: row.gift_item_value,
      }, _.isNil);
    }

    return {
      id: row.ordered_poster_id,
      type: 'mapPoster',
      quantity: row.quantity,
      mapCenter: { lat: row.map_center_lat, lng: row.map_center_lng },
      mapBounds: {
        southWest: { lat: row.map_south_west_lat, lng: row.map_south_west_lng },
        northEast: { lat: row.map_north_east_lat, lng: row.map_north_east_lng },
      },
      mapZoom: row.map_zoom,
      mapStyle: row.map_style,
      posterStyle: row.poster_style,
      mapPitch: row.map_pitch,
      mapBearing: row.map_bearing,
      orientation: row.orientation,
      size: row.size,
      labelsEnabled: row.labels_enabled,
      labelHeader: row.label_header,
      labelSmallHeader: row.label_small_header,
      labelText: row.label_text,
    };
  });

  // Sort cart items so that they are in the same order as they were saved in
  // inside one type
  const sortedCart = _.orderBy(cart, ['type', 'id']);

  // All rows should contain same info `orders` table rows, so we just pick first
  const firstRow = rows[0];

  // Always add shippingClass as the cart item to. This way it will show up on receipt etc
  sortedCart.push({ type: 'shippingClass', value: firstRow.shipping_class || 'EXPRESS', quantity: 1 });

  if (firstRow.production_class) {
    sortedCart.push({ type: 'productionClass', value: firstRow.production_class, quantity: 1 });
  }

  const sentEmailsRows = _.uniqBy(_.filter(rows, row => row.sent_email_id !== null), (row) => {
    return row.sent_email_id;
  });

  const sentEmails = _.map(sentEmailsRows, row => ({
    id: Number(row.sent_email_id),
    type: row.sent_email_type,
    createdAt: row.sent_email_created_at,
  }));

  const paymentsRows = _.uniqBy(_.filter(rows, row => row.payment_id !== null), (row) => {
    return row.payment_id;
  });

  const payments = _.map(paymentsRows, (row) => ({
    id: Number(row.payment_id),
    type: row.payment_type,
    amount: row.payment_amount,
    currency: row.payment_currency,
    paymentProvider: row.payment_payment_provider,
    paymentProviderMethod: row.payment_payment_provider_method,
    promotionCode: row.payment_promotion_code,
    stripeTokenId: row.payment_stripe_token_id,
    stripeTokenResponse: row.payment_stripe_token_response,
    stripeChargeResponse: row.payment_stripe_charge_response,
    stripePaymentIntentId: row.payment_stripe_payment_intent_id,
    stripePaymentIntentSuccessEvent: row.payment_stripe_payment_intent_success_event,
    createdAt: row.payment_created_at,
  }));

  const order = {
    email: firstRow.customer_email,
    emailSubscription: firstRow.email_subscription,
    customerValue: firstRow.customer_price_value,
    currency: firstRow.price_currency,
    promotionCode: firstRow.promotion_code,
    orderId: firstRow.pretty_order_id,
    sentEmails: _.sortBy(sentEmails, 'id'),
    payments: _.sortBy(payments, 'id'),
    cart: _.map(sortedCart, i => _.omit(i, ['id'])),
    createdAt: moment(firstRow.order_created_at),
  };

  if (order.promotionCode) {
    order.promotion = await promotionCore.getPromotion(order.promotionCode);
  }

  const originalPrice = calculateCartPrice(order.cart, { currency: order.currency });
  const paidSum = _.sumBy(order.payments, (payment) => {
    if (payment.type !== PAYMENT_TYPE.CHARGE) {
      return 0;
    }

    return payment.amount;
  });

  order.paid = originalPrice.value - paidSum <= 0;

  if (originalPrice.value - paidSum < 0) {
    logger.warn(`alert-critical More payments than needed were found, order id: ${order.orderId}`);
    logger.warn(`Customer has paid ${util.inspect(paidSum)} cents`);
  }

  if (order.customerValue !== originalPrice.value) {
    logger.warn(`alert-critical Database had different order value than calculated, order id: ${order.orderId}`);
    logger.warn(`${util.inspect(order.customerValue)} should equal to ${util.inspect(originalPrice.value)}`);
  }

  if (firstRow.shipping_city) {
    // Shipping address is missing if only digital card was ordered
    order.shippingAddress = {
      personName: firstRow.shipping_person_name,
      streetAddress: firstRow.shipping_street_address,
      streetAddressExtra: firstRow.shipping_street_address_extra,
      city: firstRow.shipping_city,
      postalCode: firstRow.shipping_postal_code,
      countryCode: firstRow.shipping_country_code,
      state: firstRow.shipping_state,
      contactPhone: firstRow.shipping_contact_phone,
    };
  }

  return order;
}

// Yes, not good.. but knex doesn't provide better options.
// https://github.com/tgriesser/knex/issues/272
function _isUniqueConstraintError(err) {
  if (!err) {
    return false;
  }

  const re = /^duplicate key value violates unique constraint/;
  return re.test(err.message);
}

function _logUniqueConstraintErrorAndRethrow(err) {
  logger.error(`alert-critical VERY RARE! Order creation failed to unique constraint error: ${err}`);
  logger.error(err);
  throw err;
}

function _saveErrorInBackgroundAndRethrow(err, fullOrder) {
  // Save failed order to make debugging easier later
  // This is on purpose launched separately from promise
  // chain so we can return the error ASAP to user
  retryingSaveFailedOrder(fullOrder, err);

  throw err;
}

function _createOrder(order, opts = {}) {
  const trx = opts.trx || knex;

  const originalPrice = calculateCartPrice(order.cart, { currency: order.currency });

  const insertObj = {
    pretty_order_id: order.prettyOrderId,
    customer_email: order.email,
    customer_price_value: originalPrice.value,
    ip_address: order.ipAddress,
    price_currency: _.get(order, 'currency', 'EUR'),
    different_billing_address: _.get(order, 'differentBillingAddress', false),
    email_subscription: _.get(order, 'emailSubscription', false),
    production_class: resolveProductionClass(order.cart),
    shipping_class: resolveShippingClass(order.cart),
    sent_to_production_at: null,
  };

  if (order.promotionCode) {
    insertObj.promotion_id = knex.raw(
      '(SELECT id FROM promotions WHERE promotion_code = ?)',
      [order.promotionCode],
    );
  }

  return trx('orders').insert(insertObj)
    .returning('*')
    .then(rows => rows[0]);
}

function _createAddress(orderId, address, opts = {}) {
  const trx = opts.trx || knex;

  return trx('addresses').insert({
    type: address.type,
    order_id: orderId,
    person_name: address.personName,
    street_address: address.streetAddress,
    street_address_extra: address.streetAddressExtra,
    city: address.city,
    postal_code: address.postalCode,
    country_code: address.countryCode,
    state: address.state,
    contact_phone: address.contactPhone,
  })
    .returning('*')
    .then(rows => rows[0]);
}

function _createOrderedPosters(orderId, cart, opts = {}) {
  const trx = opts.trx || knex;

  const posterItems = _.filter(cart, item => _.isNil(item.type) || item.type === 'mapPoster');
  return BPromise.mapSeries(posterItems, (item) => {
    const unitPrice = calculateItemPrice(item, { onlyUnitPrice: true });

    return trx('ordered_posters')
      .insert({
        order_id: orderId,
        quantity: item.quantity,
        customer_unit_price_value: unitPrice.value,
        customer_unit_price_currency: unitPrice.currency,
        map_south_west_lat: item.mapBounds.southWest.lat,
        map_south_west_lng: item.mapBounds.southWest.lng,
        map_north_east_lat: item.mapBounds.northEast.lat,
        map_north_east_lng: item.mapBounds.northEast.lng,
        map_center_lat: item.mapCenter.lat,
        map_center_lng: item.mapCenter.lng,
        map_zoom: item.mapZoom,
        map_style: item.mapStyle,
        poster_style: item.posterStyle,
        map_pitch: item.mapPitch,
        map_bearing: item.mapBearing,
        size: item.size,
        orientation: item.orientation,
        labels_enabled: item.labelsEnabled,
        label_header: item.labelHeader,
        label_small_header: item.labelSmallHeader,
        label_text: item.labelText,
      })
      .returning('*')
      .then(rows => rows[0]);
  });
}

function _createOrderedGiftItems(orderId, cart, opts = {}) {
  const trx = opts.trx || knex;

  const giftItems = _.filter(cart, item => _.includes(['giftCardValue', 'physicalGiftCard'], item.type));
  return BPromise.mapSeries(giftItems, (item) => {
    const unitPrice = calculateItemPrice(item, { onlyUnitPrice: true });

    return trx('ordered_gift_items')
      .insert({
        order_id: orderId,
        quantity: item.quantity,
        type: item.type,
        value: item.value,
        customer_unit_price_value: unitPrice.value,
        customer_unit_price_currency: unitPrice.currency,
      })
      .returning('*')
      .then(rows => rows[0]);
  });
}

// Creates a guaranteed unique ID by checking that it's not written to orders
// table yet. Retries to create a new order ID if the previously generated was
// reserved.
//
// NOTE: Race-condition "vulnerable".
//       This method guarantees that the returned ID *was* unique some
//       milliseconds ago. It is still possible with very bad luck that
//       a concurrent request created the same ID also thinking that the
//       ID is unique.
//       This is a calculated risk.
const _createUniqueOrderId = promiseRetryify((opts = {}) => {
  const trx = opts.trx || knex;

  const newOrderId = createRandomOrderId();
  return trx('orders')
    .select('*')
    .where({
      pretty_order_id: newOrderId,
    })
    .limit(1)
    .then((orders) => {
      if (!_.isEmpty(orders)) {
        logger.warn(`alert-critical Order ID already exists: ${newOrderId}`);
        throw new Error(`Order id already exists: ${newOrderId}`);
      }

      return newOrderId;
    })
    .catch((err) => {
      logger.warn(`Unique order id creation failed (#${newOrderId}). Error: ${err}`);
      throw err;
    });
}, {
  maxRetries: 20,
  // 10ms, 20ms, 40ms, 80ms, 160ms, 320ms, 640ms, 1000ms, 1000ms, 1000ms ...
  retryTimeout: retryCount => Math.min(Math.pow(2, retryCount) * 10, 1000),
  beforeRetry: retryCount => logger.warn(`Retrying to create unique id (${retryCount}) ..`),
  onAllFailed: () => logger.error('alert-critical Critical order collision! All tries to create order id failed.'),
});

module.exports = {
  createOrder,
  selectOrders,
  addEmailSent,
  createPayment,
  createOrderEvent,
  getOrder,
  getPartiallyPaidOrders,
  getOrdersReadyToProduction,
  getOrdersWithTooLongProductionTime,
  markOrderSentToProduction,
};

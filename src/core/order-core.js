const _ = require('lodash');
const crypto = require('crypto');
const moment = require('moment');
const { calculateItemPrice } = require('alvarcarto-price-util');
const promiseRetryify = require('promise-retryify');
const BPromise = require('bluebird');
const logger = require('../util/logger')(__filename);
const ADDRESS_TYPE = require('../enums/address-type');
const { knex } = require('../util/database');
const { resolveProductionClass, resolveShippingClass } = require('../util');
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

function getOrdersReadyToProduction(opts = {}) {
  const trx = opts.trx || knex;

  return selectOrders({
    // TODO: Check if express shipping and then make minimal
    addQuery: `WHERE orders.sent_to_production_at is NULL AND
      orders.created_at < NOW() - INTERVAL '${config.SEND_TO_PRODUCTION_AFTER}'
    `,
    trx,
  });
}

function getOrdersWithTooLongProductionTime(opts = {}) {
  const trx = opts.trx || knex;

  return trx.raw(`
    SELECT
      MAX(CASE WHEN webhook_events.event='USER_ORDER_DELIVERED' THEN 1 ELSE 0 END) delivered,
      orders.*
    FROM orders
    LEFT JOIN webhook_events
      ON orders.id = webhook_events.order_id
    WHERE webhook_events.order_id IS NOT NULL
      AND orders.printmotor_order_id IS NOT NULL
      AND orders.created_at <= NOW() - INTERVAL '2 days'
    GROUP BY orders.id
    HAVING MAX(CASE WHEN webhook_events.event='USER_ORDER_DELIVERED' THEN 1 ELSE 0 END) = 0
    ORDER BY orders.created_at
  `)
    .then((result) => {
      const now = moment();
      const possiblyLateOrders = _.filter(result.rows, (row) => {
        const orderDate = moment(row.created_at);
        const diffInDays = diffInWorkingDays(now, orderDate);
        const isLate = diffInDays > config.DELIVERY_IS_LATE_BUSINESS_DAYS;
        return isLate;
      });

      // These orders might still contain cancelled orders
      return BPromise.filter(possiblyLateOrders, (order) => {
        return printmotorCore.getOrder(order.printmotor_order_id)
          .then((printmotorOrder) => {
            return !printmotorCore.isOrderCancelled(printmotorOrder);
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
      orders.created_at as created_at,
      orders.customer_email as customer_email,
      orders.email_subscription as email_subscription,
      orders.promotion_code as promotion_code,
      orders.stripe_charge_response as stripe_charge_response,
      addresses.person_name as shipping_person_name,
      addresses.street_address as shipping_street_address,
      addresses.street_address_extra as shipping_street_address_extra,
      addresses.city as shipping_city,
      addresses.postal_code as shipping_postal_code,
      addresses.country_code as shipping_country_code,
      addresses.state as shipping_state,
      addresses.contact_phone as shipping_contact_phone,
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
    ${opts.addQuery}
  `, opts.params)
    .then((result) => {
      // Each ordered poster is in its own row
      const grouped = _.groupBy(result.rows, row => row.pretty_order_id);

      const orders = {};
      _.each(grouped, (rows, orderId) => {
        const orderObj = _rowsToOrderObject(rows);
        orders[orderId] = orderObj;
      });

      const uniqueOrderIds = _.uniq(_.keys(grouped));
      // Make sure the order of returned rows is not changed
      return _.map(uniqueOrderIds, orderId => orders[orderId]);
    })
    .then(orders =>
      BPromise.mapSeries(orders, (order) => {
        return promotionCore.getPromotion(order.promotionCode)
          .then(promotion => _.merge({}, order, { promotion }));
      })
    );
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
function _rowsToOrderObject(rows) {
  const cart = _.map(rows, (row) => {
    if (row.gift_item_id) {
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

  const order = {
    email: firstRow.customer_email,
    emailSubscription: firstRow.email_subscription,
    stripeChargeResponse: firstRow.stripe_charge_response,
    orderId: firstRow.pretty_order_id,
    promotionCode: firstRow.promotion_code,
    cart: _.map(sortedCart, i => _.omit(i, ['id'])),
    createdAt: moment(firstRow.created_at),
  };

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

  // https://support.stripe.com/questions/what-information-can-i-safely-store-about-my-users-payment-information
  // https://stripe.com/docs/security#out-of-scope-card-data
  //  The only sensitive data that you want to avoid handling is your customers'
  //  credit card number and CVC; other than that, you’re welcome to store
  //  any other information on your local machines.
  //  As a good rule, you can store anything returned by our API. In particular,
  // you would not have any issues storing the last four digits of your
  // customer’s card number or the expiration date for easy reference.
  return trx('orders').insert({
    pretty_order_id: order.prettyOrderId,
    customer_email: order.email,
    different_billing_address: _.get(order, 'differentBillingAddress', false),
    email_subscription: _.get(order, 'emailSubscription', false),
    stripe_token_id: _.get(order, 'stripeTokenResponse.id', null),
    stripe_token_response: _.get(order, 'stripeTokenResponse', null),
    stripe_charge_response: _.get(order, 'stripeChargeResponse', null),
    promotion_code: order.promotionCode,
    production_class: resolveProductionClass(order.cart),
    shipping_class: resolveShippingClass(order.cart),
    sent_to_production_at: null,
  })
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
//       This is a risk I'm willing to take. Other option would be to
//       wrap the whole order creation in a retry, but there's a risk to
//       write orders twice in the database.
const _createUniqueOrderId = promiseRetryify((opts = {}) => {
  const trx = opts.trx || knex;

  const newOrderId = _createOrderId();
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

// TODO: move this id creation shit to another module

function _createOrderId() {
  const now = moment.utc();
  return `${now.format('YYYY-MMDD')}-${rand4()}-${rand4()}`;
}

function rand4() {
  const num = String(randomInteger(0, 9999));
  return _.padStart(num, 4, '0');
}

const MAX_INT_32 = Math.pow(2, 32);
function randomInteger(min, max) {
  const buf = crypto.randomBytes(4);
  const hex = buf.toString('hex');

  // Enforce that MAX_INT_32 - 1 is the largest number
  // generated. This biases the distribution a little
  // but doesn't matter in practice
  // when generating smaller numbers.
  // Without this enforcement, we'd return too large numbers
  // on the case when crypto generated MAX_INT_32
  const int32 = Math.min(parseInt(hex, 16), MAX_INT_32 - 1);
  const ratio = int32 / MAX_INT_32;
  // eslint-disable-next-line
  return Math.floor(ratio * (max - min + 1)) + min;
}

module.exports = {
  createOrder,
  selectOrders,
  getOrder,
  getOrdersReadyToProduction,
  getOrdersWithTooLongProductionTime,
  markOrderSentToProduction,
};

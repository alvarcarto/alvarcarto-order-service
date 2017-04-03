const _ = require('lodash');
const crypto = require('crypto');
const moment = require('moment');
const promiseRetryify = require('promise-retryify');
const BPromise = require('bluebird');
const logger = require('../util/logger')(__filename);
const ADDRESS_TYPE = require('../enums/address-type');
const { knex } = require('../util/database');
const { retryingSaveFailedOrder } = require('./fail-safe-core');

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
      .tap((orderRow) => {
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
      .then(() => ({
        orderId: fullOrder.prettyOrderId,
      }))
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
        return null;
      }

      const order = orders[0];
      return {
        orderId: order.orderId,
        cart: order.cart,
        shippingAddress: _.pick(order.shippingAddress, ['city', 'countryCode']),
      };
    });
}

function getOrdersReadyToProduction(orderId, opts = {}) {
  const trx = opts.trx || knex;

  return selectOrders({
    // TODO: Check if express shipping and then make minimal
    addQuery: `WHERE orders.sent_to_production_at is NULL AND
      orders.created_at < NOW() - INTERVAL '3 hours'
    `,
    trx,
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
      orders.customer_email as customer_email,
      orders.email_subscription as email_subscription,
      orders.pretty_order_id as pretty_order_id,
      orders.stripe_charge_response as stripe_charge_response,
      addresses.person_name as shipping_person_name,
      addresses.street_address as shipping_street_address,
      addresses.street_address_extra as shipping_street_address_extra,
      addresses.city as shipping_city,
      addresses.postal_code as shipping_postal_code,
      addresses.country_code as shipping_country_code,
      addresses.state as shipping_state,
      addresses.contact_phone as shipping_contact_phone,
      ordered_posters.quantity as quantity,
      ordered_posters.map_south_west_lat as map_south_west_lat,
      ordered_posters.map_south_west_lng as map_south_west_lng,
      ordered_posters.map_north_east_lat as map_north_east_lat,
      ordered_posters.map_north_east_lng as map_north_east_lng,
      ordered_posters.map_style as map_style,
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
      ordered_posters.map_zoom as map_zoom
    FROM orders
    LEFT JOIN ordered_posters as ordered_posters
      ON ordered_posters.order_id = orders.id
    LEFT JOIN addresses as addresses
      ON addresses.order_id = orders.id AND
         addresses.type = 'SHIPPING'
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

      // Make sure the order of returned rows is not changed
      return _.map(result.rows, row => orders[row.pretty_order_id]);
    });
}

// Each cart item is its own row
function _rowsToOrderObject(rows) {
  const cart = _.map(rows, row => ({
    quantity: row.quantity,
    mapCenter: { lat: row.map_center_lat, lng: row.map_center_lng },
    mapBounds: {
      southWest: { lat: row.map_south_west_lat, lng: row.map_south_west_lng },
      northEast: { lat: row.map_north_east_lat, lng: row.map_north_east_lng },
    },
    mapZoom: row.map_zoom,
    mapStyle: row.map_style,
    mapPitch: row.map_pitch,
    mapBearing: row.map_bearing,
    orientation: row.orientation,
    size: row.size,
    labelsEnabled: row.labels_enabled,
    labelHeader: row.label_header,
    labelSmallHeader: row.label_small_header,
    labelText: row.label_text,
  }));

  // All rows should contain same info for all rows, so we just pick first
  const firstRow = rows[0];
  return {
    customerEmail: firstRow.customer_email,
    emailSubscription: firstRow.email_subscription,
    stripeChargeResponse: firstRow.stripe_charge_response,
    orderId: firstRow.pretty_order_id,
    cart,
    shippingAddress: {
      personName: firstRow.shipping_person_name,
      streetAddress: firstRow.shipping_street_address,
      streetAddressExtra: firstRow.shipping_street_address_extra,
      city: firstRow.shipping_city,
      postalCode: firstRow.shipping_postal_code,
      countryCode: firstRow.shipping_country_code,
      state: firstRow.shipping_state,
      contactPhone: firstRow.shipping_contact_phone,
    },
  };
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
  logger.error(`alert-1h VERY RARE! Order creation failed to unique constraint error: ${err}`);
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
    stripe_token_id: order.stripeTokenResponse.id,
    stripe_token_response: order.stripeTokenResponse,
    stripe_charge_response: order.stripeChargeResponse,
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
    person_name: address.name,
    street_address: address.address,
    street_address_extra: address.addressExtra,
    city: address.city,
    postal_code: address.postalCode,
    country_code: address.country,
    state: address.state,
    contact_phone: address.phone,
  })
    .returning('*')
    .then(rows => rows[0]);
}

function _createOrderedPosters(orderId, cart, opts = {}) {
  const trx = opts.trx || knex;
  // TODO: Insert unit price too for book keeping
  return BPromise.map(cart, item =>
    trx('ordered_posters')
      .insert({
        order_id: orderId,
        quantity: item.quantity,
        map_south_west_lat: item.mapBounds.southWest.lat,
        map_south_west_lng: item.mapBounds.southWest.lng,
        map_north_east_lat: item.mapBounds.northEast.lat,
        map_north_east_lng: item.mapBounds.northEast.lng,
        map_center_lat: item.mapCenter.lat,
        map_center_lng: item.mapCenter.lng,
        map_zoom: item.mapZoom,
        map_style: item.mapStyle,
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
      .then(rows => rows[0]),
    { concurrency: 1 }
  );
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
        logger.warn(`alert-1h Order ID already exists: ${newOrderId}`);
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
  onAllFailed: () => logger.error('alert-1h Critical order collision! All tries to create order id failed.'),
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
  getOrder,
  getOrdersReadyToProduction,
};

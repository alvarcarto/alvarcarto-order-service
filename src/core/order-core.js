const _ = require('lodash');
const BPromise = require('bluebird');
const ADDRESS_TYPE = require('../enums/address-type');
const { knex } = require('../util/database');

function createOrder(order) {
  return knex.transaction(trx =>
    _createOrder(order, { trx })
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
      }),
  );
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
    customer_email: order.email,
    email_subscription: order.emailSubscription,
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

  return BPromise.map(cart, item =>
    trx('ordered_posters')
      .insert({
        order_id: orderId,
        quantity: item.quantity,
        unit_customer_price: 1000,  // TODO
        unit_internal_price: 100,  // TODO
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
    { concurrency: 1 },
  );
}

module.exports = {
  createOrder,
};

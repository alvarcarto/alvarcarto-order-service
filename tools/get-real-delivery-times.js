#!/usr/bin/env node

// Sends an email to a customer(s)
// Usage:
// node tools/send-email.js <template> <title> <sql-query>

const _ = require('lodash');
const BPromise = require('bluebird');
const osmosis = require('osmosis');
const moment = require('moment-timezone');
const cityTimezones = require('city-timezones');
const { knex } = require('../src/util/database');

function getTrackingDetails(shippingAddress, trackingCode) {
  const provider = getTrackingProvider(trackingCode);
  return getRawItems(provider, trackingCode)
    .then(rawItemsToDelivery);
}

function rawItemsToDelivery(shippingAddress, items) {
  return {
    events: _.sortBy(_.map(items, i => transformItem(shippingAddress, i)), 'time'),
  };
}

function transformItem(address, item) {
  return {
    time: toMoment(address, item.date, item.time),
    status: iconClassToEnum(item.iconClass),
    text: item.text,
    subText: item.subText,
  };
}

function iconClassToEnum(className) {
  if (_.endsWith(className, 'delivered')) {
    return 'DELIVERED';
  } else if (_.endsWith(className, 'outfordelivery')) {
    return 'OUT_FOR_DELIVERY';
  } else if (_.endsWith(className, 'intransit')) {
    return 'IN_TRANSIT';
  }

  return 'UNKNOWN';
}

function toMoment(address, date, time) {
  const tz = addressToTimezone(address);
  return moment.tz(`${date} ${time}`, 'MMM DD, YYYY HH:mm a', tz);
}

function addressToTimezone(address) {
  return _.find(cityTimezones.lookupViaCity(address.city), { iso2: address.countryCode });
}

function getTrackingProvider(trackingCode) {
  if (_.startsWith(trackingCode.toLowerCase(), 'ma')) {
    return 'matkahuolto';
  }

  return 'dhl-germany';
}

function getRawItems(provider, trackingCode) {
  const url = `https://track.aftership.com/${provider}/${trackingCode}`;
  console.error(`Fetching data from ${url} ..`);

  return new BPromise((resolve, reject) => {
    osmosis
      .get(url)
      .find('.checkpoints__list > li')
      .set({
        date: '.checkpoint__time > strong',
        time: '.checkpoint__time > div',
        text: '.checkpoint__content > strong',
        subText: '.checkpoint__content > .hint',
        iconClass: '.checkpoint__icon@class',
      })
      .data(arr => resolve(arr))
      .error(err => reject(err));
  });
}

function main() {
  return knex.raw(`
    SELECT t.* FROM (
      SELECT
        orders.pretty_order_id as pretty_order_id,
        orders.printmotor_order_id as printmotor_order_id,
        ((stripe_charge_response->>'amount')::int / 100.0) stripe_charge_in_eur,
        orders.created_at as created_at,
        (SELECT created_at FROM webhook_events WHERE order_id = orders.id AND event = 'USER_ORDER_DELIVERED' ORDER BY created_at ASC LIMIT 1) as delivery_started_at,

        -- Sometimes the tracking code comes later via a new USER_ORDER_DELIVERED event
        -- That's why we take the latest event instead of the first one
        (SELECT payload->'userOrder'->'meta'->>'trackingCode' FROM webhook_events WHERE order_id = orders.id AND event = 'USER_ORDER_DELIVERED' ORDER BY created_at DESC LIMIT 1) as tracking_code,

        addresses.city as shipping_city,
        addresses.postal_code as shipping_postal_code,
        addresses.country_code as shipping_country_code
      FROM orders
      LEFT JOIN addresses as addresses
        ON addresses.order_id = orders.id AND
           addresses.type = 'SHIPPING'
      ORDER BY created_at ASC
    ) t
    WHERE
      tracking_code IS NOT NULL
    OFFSET 2
  `)
    .tap(({ rows }) => {
      console.log(`Found ${rows.length} rows`);

      const filteredRows = _.filter(rows, r => r.shipping_country_code === 'FI');
      return BPromise.map(filteredRows, (row) => {
        const shippingAddress = {
          city: 'Helsinki', //row.shipping_city,
          countryCode: row.shipping_country_code,
        };
        console.log(shippingAddress, row.tracking_code);

        return getTrackingDetails(shippingAddress, row.tracking_code)
          .then(console.log);
      }, { concurrency: 1});
    })
    .catch((err) => {
      console.log('Error:', err);
      throw err;
    })
    .finally(() => knex.destroy());
}

main();


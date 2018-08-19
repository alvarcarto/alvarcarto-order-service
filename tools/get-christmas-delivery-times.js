#!/usr/bin/env node

// Sends an email to a customer(s)
// Usage:
// node tools/send-email.js <template> <title> <sql-query>

const fs = require('fs');
const _ = require('lodash');
const BPromise = require('bluebird');
const scrapeIt = require('scrape-it');
const moment = require('moment-timezone');
const cityTimezones = require('city-timezones');
const { knex } = require('../src/util/database');

const CACHE_FILE_NAME = '.christmas-tracking-cache.json';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36';

function getTrackingDetails(shippingAddress, trackingCode) {
  const provider = getTrackingProvider(trackingCode);
  return getRawItems(provider, trackingCode)
    .then(rawItems => rawItemsToDelivery(shippingAddress, rawItems));
}

function rawItemsToDelivery(shippingAddress, items) {
  return {
    events: _.sortBy(_.map(items, i => transformItem(shippingAddress, i)), 'time'),
  };
}

function transformItem(address, item) {
  return {
    time: toMoment(address, item.dateTime),
    status: getEventStatus(item.text),
    text: item.text,
    location: item.location,
  };
}

function getEventStatus(text) {
  if (_.startsWith(text, 'Luovutettu')) {
    return 'DELIVERED';
  } else if (_.startsWith(text, 'Ilmoitettu')) {
    return 'CUSTOMER_NOTIFIED';
  } else if (_.startsWith(text, 'Noudettavissa')) {
    return 'OUT_FOR_DELIVERY';
  } else if (_.startsWith(text, 'Lähtenyt')) {
    return 'IN_TRANSIT';
  }

  return 'UNKNOWN';
}

function toMoment(address, dateTime) {
  //const tz = addressToTimezone(address);
  const momentObj = moment.tz(dateTime, 'DD.MM.YYYY, HH:mm', 'Europe/Helsinki');
  if (!momentObj.isValid()) {
    throw new Error(`Incorrect date: ${dateTime}`);
  }

  return momentObj;
}

function addressToTimezone(address) {
  return _.find(cityTimezones.lookupViaCity(address.city), { iso2: address.countryCode });
}

function getTrackingProvider(trackingCode) {
  if (_.startsWith(trackingCode.toLowerCase(), 'ma')) {
    return 'matkahuolto';
  }

  throw new Error('Unsupported tracking provider');
  return 'dhl-germany';
}

function getRawItems(provider, trackingCode) {
  const url = `https://www.matkahuolto.fi/seuranta/tilanne/?package_code=${trackingCode}`;
  console.error(`Fetching data from ${url} ..`);

  // Promise interface
  return scrapeIt({
    url,
    headers: { 'User-Agent': USER_AGENT },
  }, {
    items: {
      listItem: '.events-list .event',
      data: {
        dateTime: '.timestamp',
        text: '.event-details > div:first-child',
        location: '.event-details > div:last-child',
      },
    },
  })
  .then(result => result.items);
}

function upsertToCache(trackingInfo) {
  const obj = getCache();
  obj[trackingInfo.trackingCode] = trackingInfo;
  fs.writeFileSync(CACHE_FILE_NAME, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
}

function getCache() {
  try {
    const text = fs.readFileSync(CACHE_FILE_NAME, { encoding: 'utf8' });
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function main() {
  return knex.raw(`
    SELECT t.* FROM (
      SELECT
        orders.pretty_order_id as pretty_order_id,
        orders.printmotor_order_id as printmotor_order_id,
        ((stripe_charge_response->>'amount')::int / 100.0) as stripe_charge_in_eur,
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
    ) t
    WHERE
      tracking_code IS NOT NULL AND
      created_at >= '2017-12-01 00:00:00'
      ORDER BY t.created_at ASC
  `)
    .tap(({ rows }) => {
      console.log(`Found ${rows.length} rows`);

      const currentCache = getCache();

      const filteredRows = _.filter(rows, r => r.shipping_country_code === 'FI');
      return BPromise.mapSeries(filteredRows, (row) => {
        if (_.has(currentCache, row.tracking_code)) {
          console.error(`Tracking info already in cache for ${row.tracking_code}, skipping .. `);
          return BPromise.resolve();
        }

        const shippingAddress = {
          city: 'Helsinki', //row.shipping_city,
          countryCode: row.shipping_country_code,
        };

        return getTrackingDetails(shippingAddress, row.tracking_code)
          .then((trackingDetails) => {
            const trackingInfo = _.merge({
              prettyOrderId: row.pretty_order_id,
              printmotorOrderId: row.printmotor_order_id,
              orderCreatedAt: row.created_at,
              trackingCode: row.tracking_code,
              deliveryStartedAt: row.delivery_started_at,
              stripeChargeInEur: row.stripe_charge_in_eur,
              shippingAddress: {
                countryCode: row.shipping_country_code,
                postalCode: row.shipping_postal_code,
                city: row.shipping_city,
              },
            }, trackingDetails);

            upsertToCache(trackingInfo);
          })
          .then(() => {
            const randomDelay = getRandomInt(5000, 10000);
            console.error(`Waiting for ${randomDelay}ms ..`);
            return BPromise.delay(randomDelay);
          });
      });
    })
    .catch((err) => {
      console.log('Error:', err);
      throw err;
    })
    .finally(() => knex.destroy());
}

main();

#!/usr/bin/env node

// Usage:
// node delivery-analytics.js

const _ = require('lodash');
const histogram = require('./histogram');
const moment = require('moment-business-time');
const { knex } = require('../src/util/database');
const { diffInWorkingDays } = require('../src/util/time');

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
      tracking_code IS NOT NULL
      -- Uncomment this to limit the examination to only certain month of the year
      -- AND EXTRACT(MONTH FROM t.created_at) = 1
    ORDER BY t.created_at ASC
  `)
    .tap(({ rows }) => {
      console.log(`Found ${rows.length} rows`);
      const orders = _.map(rows, (row) => {
        return {
          prettyOrderId: row.pretty_order_id,
          printmotorOrderId: row.printmotor_order_id,
          orderCreatedAt: row.created_at,
          trackingCode: row.tracking_code,
          deliveryStartedAt: row.delivery_started_at,
          orderCreateToDeliveryStart: diffInWorkingDays(
            moment(row.delivery_started_at),
            moment(row.created_at),
          ),
          stripeChargeInEur: row.stripe_charge_in_eur,
          shippingAddress: {
            countryCode: row.shipping_country_code,
            postalCode: row.shipping_postal_code,
            city: row.shipping_city,
          },
        };
      });

      const businessDays = {};
      _.forEach(orders, (order) => {
        const days = order.orderCreateToDeliveryStart.toFixed(1);
        if (_.has(businessDays, days)) {
          businessDays[days] += 1;
        } else {
          businessDays[days] = 1;
        }
      });

      console.log(histogram(businessDays, { sort: 'keys', sortDirection: 'asc' }));
    })
    .catch((err) => {
      console.log('Error:', err);
      throw err;
    })
    .finally(() => knex.destroy());
}

main();

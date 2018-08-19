#!/usr/bin/env node

const _ = require('lodash');
const holidays = require('finnish-holidays-js');
const moment = require('moment-business-time');
const BPromise = require('bluebird');
const fs = require('fs');
const csv = require('csv');

function pad(str) {
  return _.padStart(str, 2, '0');
}

const years = [2017, 2018, 2019, 2020];
const arrOfArrs = _.map(years, y => holidays.year(y));
const allYearsHolidays = _.flatten(_.map(arrOfArrs, (singleYearHolidays) => {
  return _.map(singleYearHolidays, obj => `${obj.year}-${pad(obj.month)}-${pad(obj.day)}`);
}));

moment.updateLocale('fi', {
  workinghours: {
    0: null,
    1: ['09:00:00', '17:00:00'],
    2: ['09:00:00', '17:00:00'],
    3: ['09:00:00', '17:00:00'],
    4: ['09:00:00', '17:00:00'],
    5: ['09:00:00', '17:00:00'],
    6: null,
  },
  holidays: allYearsHolidays,
});
moment.locale('fi');

BPromise.promisifyAll(csv);

if (!process.argv[2]) {
  console.error('Incorrect parameters');
  console.error('Usage: ./delivery-time-to-csv.js <json-file>');
  process.exit(2);
}

const COLUMNS_IN_ORDER = [
  'prettyOrderId',
  'printmotorOrderId',
  'trackingCode',
  'orderCreatedAt',
  'deliveryStartedAt',
  'deliveryFirstInteresting',
  'deliveryFirstInTransit',
  'deliveryCustomerNotified',
  'deliveryCustomerReceived',
  'stripeChargeInEur',
  'shippingCountry',
  'shippingCity',
  'shippingPostalCode',
  'orderCreateToFirstInterestingDays',
  'orderCreateToDeliveryStart',
  'deliveryStartedToFirstInteresting',
  'firstInterestingToInTransitDays',
  'firstInTransitToNotified',
  'orderCreateToInTransitDays',
  'orderCreateToNotifiedDays',
  'customerNotifiedToReceivedDays',
  'deliveryStartedToNotification',
];

function findEventTime(events, status) {
  const event = _.find(events, e => e.status === status);
  if (!event) {
    return null;
  }

  return moment(event.time);
}

function findFirstInTransit(events) {
  const event = _.find(events, e => e.status === 'IN_TRANSIT' || _.includes(e.text.toLowerCase(), 'matkalla'));
  if (!event) {
    return null;
  }

  return moment(event.time);
}

function findFirstInterestingEventTime(events) {
  if (events.length < 2) {
    return null;
  }

  return moment(events[1].time);
}

function calculateDiffs(info) {
  const diffs = {};
  if (info.deliveryFirstInteresting && info.orderCreatedAt) {
    diffs.orderCreateToFirstInterestingDays = info.deliveryFirstInteresting.workingDiff(info.orderCreatedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryStartedAt && info.orderCreatedAt) {
    diffs.orderCreateToDeliveryStart = info.deliveryStartedAt.workingDiff(info.orderCreatedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryStartedAt && info.deliveryFirstInteresting) {
    diffs.deliveryStartedToFirstInteresting = info.deliveryFirstInteresting.workingDiff(info.deliveryStartedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryFirstInTransit && info.deliveryFirstInteresting) {
    diffs.firstInterestingToInTransitDays = info.deliveryFirstInTransit.workingDiff(info.deliveryFirstInteresting, 'days', true).toFixed(4);
  }
  if (info.deliveryCustomerNotified && info.deliveryFirstInTransit) {
    diffs.firstInTransitToNotified = info.deliveryCustomerNotified.workingDiff(info.deliveryFirstInTransit, 'days', true).toFixed(4);
  }
  if (info.deliveryFirstInTransit && info.orderCreatedAt) {
    diffs.orderCreateToInTransitDays = info.deliveryFirstInTransit.workingDiff(info.orderCreatedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryCustomerNotified && info.orderCreatedAt) {
    diffs.orderCreateToNotifiedDays = info.deliveryCustomerNotified.workingDiff(info.orderCreatedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryCustomerReceived && info.deliveryCustomerNotified) {
    diffs.customerNotifiedToReceivedDays = info.deliveryCustomerReceived.workingDiff(info.deliveryCustomerNotified, 'days', true).toFixed(4);
  }
  if (info.deliveryStartedAt && info.deliveryCustomerNotified) {
    diffs.deliveryStartedToNotification = info.deliveryCustomerNotified.workingDiff(info.deliveryStartedAt, 'days', true).toFixed(4);
  }
  return diffs;
}

function main() {
  const fileContent = fs.readFileSync(process.argv[2], { encoding: 'utf8' });
  const data = JSON.parse(fileContent);

  const processedData = _.map(data, (trackingInfo, trackingCode) => {
    const { events } = trackingInfo;

    const info = {
      prettyOrderId: trackingInfo.prettyOrderId,
      printmotorOrderId: trackingInfo.printmotorOrderId,
      trackingCode: trackingInfo.trackingCode,
      orderCreatedAt: moment(trackingInfo.orderCreatedAt),
      deliveryStartedAt: moment(trackingInfo.deliveryStartedAt),
      deliveryFirstInteresting: findFirstInterestingEventTime(events),
      deliveryFirstInTransit: findFirstInTransit(_.sortBy(events, 'time')),
      deliveryCustomerNotified: findEventTime(events, 'CUSTOMER_NOTIFIED'),
      deliveryCustomerReceived: findEventTime(events, 'DELIVERED'),
      stripeChargeInEur: trackingInfo.stripeChargeInEur
        ? Number(trackingInfo.stripeChargeInEur).toFixed(2)
        : null,
      shippingCountry: trackingInfo.shippingAddress.countryCode,
      shippingCity: trackingInfo.shippingAddress.city,
      shippingPostalCode: trackingInfo.shippingAddress.postalCode,
    };

    return _.merge({}, info, calculateDiffs(info));
  });

  const sortedData = _.sortBy(processedData, 'orderCreatedAt');
  const csvRows = [COLUMNS_IN_ORDER].concat(_.map(sortedData, (obj) => {
    return _.map(COLUMNS_IN_ORDER, key => obj[key]);
  }));

  return csv.stringifyAsync(csvRows)
    .tap(str => console.log(str))
    .catch((err) => {
      console.log('err', err)
      throw err;
    });
}

main();

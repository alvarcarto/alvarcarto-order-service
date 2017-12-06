#!/usr/bin/env node

const _ = require('lodash');
const moment = require('moment');
const BPromise = require('bluebird');
const fs = require('fs');
const csv = require('csv');

BPromise.promisifyAll(csv);

if (!process.argv[2]) {
  console.error('Incorrect parameters');
  console.error('Usage: ./delivery-time-to-csv.js <json-file>');
  process.exit(2);
}

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
    diffs.orderCreateToFirstInterestingDays = info.deliveryFirstInteresting.diff(info.orderCreatedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryStartedAt && info.orderCreatedAt) {
    diffs.orderCreateToDeliveryStart = info.deliveryStartedAt.diff(info.orderCreatedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryStartedAt && info.deliveryFirstInteresting) {
    diffs.deliveryStartedToFirstInteresting = info.deliveryFirstInteresting.diff(info.deliveryStartedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryFirstInTransit && info.deliveryFirstInteresting) {
    diffs.firstInterestingToInTransitDays = info.deliveryFirstInTransit.diff(info.deliveryFirstInteresting, 'days', true).toFixed(4);
  }
  if (info.deliveryCustomerNotified && info.deliveryFirstInTransit) {
    diffs.firstInTransitToNotified = info.deliveryCustomerNotified.diff(info.deliveryFirstInTransit, 'days', true).toFixed(4);
  }
  if (info.deliveryFirstInTransit && info.orderCreatedAt) {
    diffs.orderCreateToInTransitDays = info.deliveryFirstInTransit.diff(info.orderCreatedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryCustomerNotified && info.orderCreatedAt) {
    diffs.orderCreateToNotifiedDays = info.deliveryCustomerNotified.diff(info.orderCreatedAt, 'days', true).toFixed(4);
  }
  if (info.deliveryCustomerReceived && info.deliveryCustomerNotified) {
    diffs.customerNotifiedToReceivedDays = info.deliveryCustomerReceived.diff(info.deliveryCustomerNotified, 'days', true).toFixed(4);
  }
  if (info.deliveryStartedAt && info.deliveryCustomerNotified) {
    diffs.deliveryStartedToNotification = info.deliveryCustomerNotified.diff(info.deliveryStartedAt, 'days', true).toFixed(4);
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
  const headers = _.keys(sortedData[0]);
  const csvRows = [headers].concat(_.map(sortedData, (obj) => {
    return _.map(headers, key => obj[key]);
  }));

  return csv.stringifyAsync(csvRows)
    .tap(str => console.log(str))
    .catch((err) => {
      console.log('err', err)
      throw err;
    });
}

main();

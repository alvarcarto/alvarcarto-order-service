const _ = require('lodash');
const { moment } = require('../util/moment');
const config = require('../config');

const MESSAGES = [
  {
    start: moment('2019-10-28T23:00:00Z'),
    end: moment('2019-12-02T12:00:00Z'),
    title: 'Black Weekend is here!',
    message: 'Get -20% off from all our products during the weekend.',
    // Supported icons here: https://ant.design/components/icon/
    // (make sure you check the correct antd version)
    icon: 'fire',
  },
  {
    start: moment('2019-01-12T00:00:00Z'),
    end: moment('2019-12-16T10:00:00Z'),
    title: 'Order your Christmas presents in time!',
    message: 'Place your order on 15th of December at latest to make sure your presents arrive in time.',
    icon: 'gift',
  },
  {
    start: moment('2019-12-16T10:00:00Z'),
    end: moment('2019-12-19T10:00:00Z'),
    title: 'There might still be time!',
    message: 'Order your Christmas presents now, and they might still make it in time.',
    icon: 'gift',
  },
  {
    start: moment('2019-12-19T10:00:00Z'),
    end: moment('2019-12-25T10:00:00Z'),
    title: 'Last-minute gift shopping?',
    message: 'We can\'t guarantee that your order will make it in time for Christmas but better late than never!',
    icon: 'gift',
  },
  {
    start: moment('2020-05-27T23:00:00Z'),
    end: moment('2020-06-29T10:00:00Z'),
    title: 'Plywood maps are here!',
    message: 'Maps are printed on a high-quality Finnish birch plywood. Built-in hanging system allows you to hang your maps easily. Order yours now!',
    icon: 'bell',
  },
];

if (config.NODE_ENV === 'test') {
  // Insert a test code before everything else in test mode.
  MESSAGES.unshift({
    start: moment('2010-01-01T00:00:00Z'),
    end: moment('2030-01-01T00:00:00Z'),
    title: 'Test title',
    message: 'Test message',
    icon: 'fire',
  });
}

async function getCurrentMessage() {
  const now = moment();
  const current = _.find(MESSAGES, (msg) => {
    return now.isBetween(msg.start, msg.end);
  });

  if (!_.isPlainObject(current)) {
    return undefined;
  }

  return current;
}

module.exports = {
  getCurrentMessage,
};

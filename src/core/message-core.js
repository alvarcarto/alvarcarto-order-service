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
    end: moment('2019-12-24T00:00:00Z'),
    title: 'Order your Christmas presents in time!',
    message: 'Place your order on 14th of December at latest to make sure your presents arrive in time.',
    icon: 'gift',
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

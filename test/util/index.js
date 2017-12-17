/* eslint-disable no-console */

const _ = require('lodash');
const chalk = require('chalk');
const { diffString } = require('json-diff');

function expectDeepEqual(a, b) {
  if (!_.isEqual(a, b)) {
    console.log(chalk.bold('Objects are not deeply equal:'));
    console.log(chalk.green('+ unexpected'), chalk.red('- missing'));
    console.log(diffString(a, b));
    throw new Error('Objects did not deeply equal');
  }

  return true;
}

module.exports = {
  expectDeepEqual,
};

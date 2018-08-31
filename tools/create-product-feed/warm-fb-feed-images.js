#!/usr/bin/env node

// This tool downloads all Facebook dynamic product feed image links
// Usage:
// node this-tool.js feed.csv

const BPromise = require('bluebird');
const request = require('request-promise');
const chalk = require('chalk');
const _ = require('lodash');
const fs = require('fs');
const csv = require('csv');

BPromise.promisifyAll(csv);

if (!process.argv[2]) {
  console.error('Incorrect parameters');
  console.error('Usage: ./this-tool.js <fb-feed-csv-file>');
  process.exit(2);
}

function getColumn(name, headers, row) {
  const index = _.findIndex(headers, h => h === name);
  if (index === -1) {
    throw new Error(`No column data found for ${name} from ${row}. Index: ${index}, ${headers}`);
  }
  return row[index];
}

function warm(data) {
  const headers = _.head(data);

  const rows = _.filter(_.tail(data), row => !_.isEmpty(row[0]));
  const imageUrls = _.map(rows, r => getColumn('image_link', headers, r));

  return BPromise.each(imageUrls, (url) => {
    return request({ url, time: true, encoding: null, resolveWithFullResponse: true })
      .then((res) => {
        const rounded = Math.round(res.timingPhases.total);
        const timeMs = `${rounded}ms`;
        let color = chalk.green;
        if (rounded > 20000) {
          color = chalk.yellow;
        } else if (rounded > 40000) {
          color = chalk.red;
        }
        console.error(`${color(timeMs)} ${url}`);
      });
  });
}

function main() {
  const INPUT_CSV_PATH = process.argv[2];
  const fileContent = fs.readFileSync(INPUT_CSV_PATH, { encoding: 'utf8' });

  csv.parseAsync(fileContent, {
    comment: '#',
    delimiter: ',',
    auto_parse: false,
    trim: true,
  })
  .tap(data => warm(data))
  .catch((err) => {
    console.log('err', err)
    throw err;
  });
}

main();

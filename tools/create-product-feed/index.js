#!/usr/bin/env node

// This tool enriches Facebook CSV product catalog
// Usage:
// node tools/enrich-product-feed.js cities.csv > feed.csv

const BPromise = require('bluebird');
const fs = require('fs');
const csv = require('csv');
const transform = require('./transform');

BPromise.promisifyAll(csv);

if (!process.argv[2]) {
  console.error('Incorrect parameters');
  console.error('Usage: ./enrich-product-feed.js <csv-file>');
  process.exit(2);
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
  .then(data => transform(data))
  .then(newRows => csv.stringifyAsync(newRows))
  .tap(str => console.log(str))
  .catch((err) => {
    console.log('err', err)
    throw err;
  });
}

main();

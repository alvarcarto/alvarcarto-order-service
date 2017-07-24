// Warning: singleton (I was lazy)

const BPromise = require('bluebird');
const fs = require('fs');
const maps = require('@google/maps');

const googleMapsClient = maps.createClient({
  key: process.env.GOOGLE_GEOCODE_API_KEY,
});
BPromise.promisifyAll(googleMapsClient);
BPromise.promisifyAll(fs);

let initialReadDone = false;
let cache = {};

function geocode(query, opts = { cacheFile: '.geocode-cache.json' }) {
  return readKey(pickKey(query), opts)
    .then(value => {
      if (value) {
        return value;
      }

      return googleMapsClient.geocodeAsync(query)
        .then(res => res.json)
        .tap(data => writeKey(pickKey(query), data, opts));
    });
}

function pickKey(query) {
  return query.address;
}

function writeKey(key, value, opts = {}) {
  const promise = initialReadDone
    ? BPromise.resolve()
    : doInitialRead(opts);

  return promise
    .then(() => {
      cache[key] = value;
      return writeCacheToFile(JSON.stringify(cache, null, 2), opts);
    });
}

function readKey(key, opts = {}) {
  const promise = initialReadDone
    ? BPromise.resolve()
    : doInitialRead(opts);

  return promise.then(() => cache[key]);
}

function doInitialRead(opts = {}) {
  return fs.readFileAsync(opts.cacheFile, { encoding: 'utf8' })
    .tap(data => {
      try {
        cache = JSON.parse(data);
        initialReadDone = true;
      } catch (e) {
        console.error('Cache file contained illegal JSON.')
      }
    })
    .catch(err => {
      if (err.code !== 'ENOENT') {
        throw err;
      }

      return null;
    });
}

function writeCacheToFile(data, opts = {}) {
  return fs.writeFileAsync(opts.cacheFile, data, { encoding: 'utf8' })
    .catch(err => {
      throw err;
    });
}

module.exports = geocode;
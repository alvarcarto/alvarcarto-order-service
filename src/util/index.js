const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const qs = require('qs');
const _ = require('lodash');
const { moment } = require('../util/moment');
const config = require('../config');

function readFileSync(filePath) {
  const rootDir = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(rootDir, filePath), { encoding: 'utf8' });
}

function createPosterImageUrl(item) {
  const query = qs.stringify(createPosterUrlParameters(item));
  return `${config.RENDER_API_URL}/api/raster/render?${query}`;
}

function createPosterUrlParameters(item) {
  const mapItem = item.customisation;
  return {
    swLat: mapItem.mapBounds.southWest.lat,
    swLng: mapItem.mapBounds.southWest.lng,
    neLat: mapItem.mapBounds.northEast.lat,
    neLng: mapItem.mapBounds.northEast.lng,
    mapStyle: mapItem.mapStyle,
    posterStyle: mapItem.posterStyle,
    size: mapItem.size,
    orientation: mapItem.orientation,
    labelsEnabled: mapItem.labelsEnabled,
    labelHeader: mapItem.labelHeader,
    labelSmallHeader: mapItem.labelSmallHeader,
    labelText: mapItem.labelText,
  };
}

function resolveProductionClass(cart) {
  const found = _.find(cart, i => i.sku === 'production-high-priority');
  if (found) {
    return 'HIGH';
  }

  return 'REGULAR';
}

function resolveShippingClass(cart) {
  const found = _.find(cart, i => i.sku === 'shipping-express');
  if (found) {
    return 'EXPRESS';
  }

  return 'EXPRESS';
}

function getShipToCountry(order) {
  return _.get(order, 'shippingAddress.countryCode', undefined);
}

function filterMapPosterCart(cart) {
  return _.filter(cart, item => _.startsWith(item.sku, 'custom-map'));
}

function filterOtherItemsCart(cart) {
  return _.filter(cart, item => !_.startsWith(item.sku, 'custom-map'));
}

function toLog(obj) {
  if (_.isObject(obj)) {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return String(obj);
    }
  }

  return String(obj);
}

function createRandomOrderId() {
  const now = moment.utc();
  return `${now.format('YYYY-MMDD')}-${rand4()}-${rand4()}`;
}

function rand4() {
  const num = String(randomInteger(0, 9999));
  return _.padStart(num, 4, '0');
}

const MAX_INT_32 = Math.pow(2, 32);
function randomInteger(min, max) {
  const buf = crypto.randomBytes(4);
  const hex = buf.toString('hex');

  // Enforce that MAX_INT_32 - 1 is the largest number
  // generated. This biases the distribution a little
  // but doesn't matter in practice
  // when generating smaller numbers.
  // Without this enforcement, we'd return too large numbers
  // on the case when crypto generated MAX_INT_32
  const int32 = Math.min(parseInt(hex, 16), MAX_INT_32 - 1);
  const ratio = int32 / MAX_INT_32;
  return Math.floor(ratio * (max - min + 1)) + min;
}

module.exports = {
  readFileSync,
  createPosterImageUrl,
  resolveProductionClass,
  resolveShippingClass,
  toLog,
  filterMapPosterCart,
  filterOtherItemsCart,
  createRandomOrderId,
  getShipToCountry,
};

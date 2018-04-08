const path = require('path');
const fs = require('fs');
const qs = require('qs');
const _ = require('lodash');
const config = require('../config');

function readFileSync(filePath) {
  const rootDir = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(rootDir, filePath), { encoding: 'utf8' });
}

function createPosterImageUrl(mapItem) {
  const query = qs.stringify(createPosterUrlParameters(mapItem));
  return `${config.RENDER_API_URL}/api/raster/render?${query}`;
}

function createPosterUrlParameters(mapItem) {
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
  const found = _.find(cart, i => i.type === 'productionClass');
  if (found) {
    return found.value;
  }

  return null;
}

function resolveShippingClass(cart) {
  const found = _.find(cart, i => i.type === 'shippingClass');
  if (found) {
    return found.value;
  }

  return null;
}

function filterMapPosterCart(cart) {
  return _.filter(cart, item => !item.type || item.type === 'mapPoster');
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

module.exports = {
  readFileSync,
  createPosterImageUrl,
  resolveProductionClass,
  resolveShippingClass,
  toLog,
  filterMapPosterCart,
};

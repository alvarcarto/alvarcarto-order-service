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
    style: mapItem.mapStyle,
    size: mapItem.size,
    orientation: mapItem.orientation,
    labelsEnabled: mapItem.labelsEnabled,
    labelHeader: mapItem.labelHeader.toUpperCase(),
    labelSmallHeader: mapItem.labelSmallHeader.toUpperCase(),
    labelText: mapItem.labelText.toUpperCase(),
  };
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
  toLog,
};

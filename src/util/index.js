const _ = require('lodash');
const { oneLineTrim } = require('common-tags');
const config = require('../config');

function createPosterImageUrl(mapItem) {
  return oneLineTrim`
    ${config.RENDER_API_URL}/api/raster/render
    ?swLat=${mapItem.mapBounds.southWest.lat}
    &swLng=${mapItem.mapBounds.southWest.lng}
    &neLat=${mapItem.mapBounds.northEast.lat}
    &neLng=${mapItem.mapBounds.northEast.lng}
    &style=${mapItem.mapStyle}
    &size=${mapItem.size}
    &orientation=${mapItem.orientation}
    &labelsEnabled=${mapItem.labelsEnabled}
    &labelHeader=${mapItem.labelHeader.toUpperCase()}
    &labelSmallHeader=${mapItem.labelSmallHeader.toUpperCase()}
    &labelText=${mapItem.labelText.toUpperCase()}
  `;
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
  createPosterImageUrl,
  toLog,
};
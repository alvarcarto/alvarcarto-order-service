const config = require('../config');
const { oneLineTrim } = require('common-tags');

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

module.exports = {
  createPosterImageUrl,
};
const geolib = require('geolib');

function getCenter(poster) {
  const center = geolib.getCenter([
    { latitude: poster.neLat, longitude: poster.neLng },
    { latitude: poster.swLat, longitude: poster.swLng },
  ]);

  return { lat: center.latitude, lng: center.longitude };
}

function coordToPrettyText(coord) {
  const first = {
    val: Math.abs(coord.lat).toFixed(3),
    label: coord.lat > 0 ? 'N' : 'S',
  };

  const second = {
    val: Math.abs(coord.lng).toFixed(3),
    label: coord.lng > 0 ? 'E' : 'W',
  };

  return `${first.val}°${first.label} / ${second.val}°${second.label}`;
}

module.exports = {
  getCenter,
  coordToPrettyText,
};

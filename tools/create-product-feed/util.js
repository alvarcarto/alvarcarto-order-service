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

function sec(val) {
  return 1 / Math.cos(val);
}

function getTileNumber(lat, lon, zoom) {
    const xtile = Math.floor( (lon+180)/360 * Math.pow(2, zoom) ) ;
    const ytile = Math.floor( (1 - Math.log(Math.tan(deg2rad(lat)) + sec(deg2rad(lat)))/Math.PI)/2 * Math.pow(2, zoom) ) ;
    return [xtile, ytile];
}

function getLonLat(xtile, ytile, zoom) {
	const n = Math.pow(2, zoom);
	const lonDeg = xtile / n * 360.0 - 180.0;
	const latDeg = rad2deg(Math.atan(Math.sinh(Math.PI * (1 - 2 * ytile / n))));
	return [lonDeg, latDeg];
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function rad2deg(rad) {
  return rad / (Math.PI / 180);
}

// convert from permalink OSM format like:
// http://www.openstreetmap.org/?lat=43.731049999999996&lon=15.79375&zoom=13&layers=M
// to OSM "Export" iframe embedded bbox format like:
// http://www.openstreetmap.org/export/embed.html?bbox=15.7444,43.708,15.8431,43.7541&layer=mapnik

function latLngToBbox(lat, lon, zoom) {
  const width = 375;
  const height = 500;	
	const tileSize = 128;

	const [xtile, ytile] = getTileNumber(lat, lon, zoom);

	const xtileS = (xtile * tileSize - width/2) / tileSize;
	const ytileS = (ytile * tileSize - height/2) / tileSize;
	const xtileE = (xtile * tileSize + width/2) / tileSize;
	const ytileE = (ytile * tileSize + height/2) / tileSize;

	const [lonS, latS] = getLonLat(xtileS, ytileS, zoom);
	const [lonE, latE] = getLonLat(xtileE, ytileE, zoom);

  return {
    southWest: {
      lat: latS,
      lng: lonS,
    },
    northEast: {
      lat: latE,
      lng: lonE,
    },
  };
}

function boundsToZoom(point1, point2) {
  const dist = geolib.getDistance(point1, point2) / 1000;

  if (dist < 30) {
    return 13;
  } else if (dist < 50) {
    return 12;
  } else if (dist < 80) {
    return 11;
  } else if (dist < 100) {
    return 10;
  } else if (dist < 200) {
    return 8;
  } else if (dist < 300) {
    return 7;
  } else if (dist < 500) {
    return 6;
  } else if (dist < 1000) {
    return 5;
  } else if (dist < 2000) {
    return 3.5;
  } else if (dist < 3000) {
    return 3;
  } else {
    return 2;
  }
}

module.exports = {
  getCenter,
  coordToPrettyText,
  latLngToBbox,
  boundsToZoom,
};

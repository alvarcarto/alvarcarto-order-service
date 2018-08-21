const _ = require('lodash');
const fs = require('fs');

const USE_COUNTRIES = [
  'NL', 'PT', 'BE', 'PL', 'BG', 'FR', 'ES', 'RO',
  'IE', 'SE', 'IT', 'DE', 'AT', 'SK', 'GR', 'SI',
  'HR', 'FI', 'CY', 'DK', 'LV', 'CZ', 'LT', 'HU',
  'LU', 'EE', 'MT', 'GB',
  'US', 'CA', 'RU',
];

// geonameid  name  asciiname alternatenames  latitude  longitude feature class feature code  country code  cc2 admin1 code admin2 code admin3 code admin4 code population  elevation dem timezone  modified
function transform(matrix) {
  const rows = _.filter(_.tail(matrix), row => !_.isEmpty(row[0]));
  const cities = _.map(rows, row => ({
    id: latLngToCityId(Number(row[4]), Number(row[5])),
    name: row[1],
    lat: Number(row[4]),
    lng: Number(row[5]),
    countryCode: row[8],
    population: Number(row[14]),
  }));
  const filteredCities = _.filter(cities, c => c.population > 50000 && _.includes(USE_COUNTRIES, c.countryCode));

  const text = JSON.stringify(filteredCities, null, 2);
  fs.writeFileSync('cities.json', text, { encoding: 'utf8' });
  return [];
}

function latLngToCityId(lat, lng) {
  return `${lat.toFixed(3)}L${lng.toFixed(3)}`;
}

module.exports = transform;

const _ = require('lodash');

const EU_COUNTRIES = [
  'NL', 'PT', 'BE', 'PL', 'BG', 'FR', 'ES', 'RO',
  'IE', 'SE', 'IT', 'DE', 'AT', 'SK', 'GR', 'SI',
  'HR', 'FI', 'CY', 'DK', 'LV', 'CZ', 'LT', 'HU',
  'LU', 'EE', 'MT', 'GB',
];

function isEuCountry(countryCode) {
  return _.includes(EU_COUNTRIES, countryCode.toUpperCase());
}

module.exports = {
  isEuCountry,
};

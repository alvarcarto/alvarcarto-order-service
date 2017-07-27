const BPromise = require('bluebird');
const _ = require('lodash');
const cities = require('../../data/cities.json');
const geolib = require('geolib');

function getCloseCities(lat, lng) {
  const sorted = _.sortBy(cities, c => geolib.getDistance({ lat, lng }, { lat: c.lat, lng: c.lng }));
  const citiesWithDistance = _.map(_.take(sorted, 5), c => _.merge({}, c, {
    distanceMeters: geolib.getDistance({ lat, lng }, { lat: c.lat, lng: c.lng }),
  }));

  const closeEnoughCities = _.filter(citiesWithDistance, c => c.distanceMeters < 1000 * 500);
  return BPromise.resolve(closeEnoughCities);
}

module.exports = {
  getCloseCities,
};

const BPromise = require('bluebird');
const _ = require('lodash');
const geolib = require('geolib');
const cities = require('../../data/cities.json');

function getCloseCities(lat, lng) {
  const sorted = _.sortBy(cities, c => geolib.getDistance({ lat, lng }, { lat: c.lat, lng: c.lng }));
  const citiesWithDistance = _.map(_.take(sorted, 30), c => _.merge({}, c, {
    distanceMeters: geolib.getDistance({ lat, lng }, { lat: c.lat, lng: c.lng }),
  }));

  const closeEnoughCities = _.filter(citiesWithDistance, c => c.distanceMeters < 1000 * 500);
  const sortedByPopulation = _.reverse(_.sortBy(closeEnoughCities, (c) => {
    return (Math.sqrt(c.population) * 100) - c.distanceMeters;
  }));
  return BPromise.resolve(_.take(sortedByPopulation, 5));
}

module.exports = {
  getCloseCities,
};

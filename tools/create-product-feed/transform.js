const _ = require('lodash');
const qs = require('qs');
const seedrandom = require('seedrandom');
const BPromise = require('bluebird');
const moment = require('moment');
const countries = require('i18n-iso-countries');
const combinatorics = require('js-combinatorics');
const { oneLine } = require('common-tags');
const { calculateItemPrice } = require('alvarcarto-price-util');
const common = require('alvarcarto-common');
const config = require('../../src/config');
const { coordToPrettyText } = require('./util');
const cachingGeocode = require('./caching-geocode');

const USE_COUNTRIES = [
  'NL', 'PT', 'BE', 'PL', 'BG', 'FR', 'ES', 'RO',
  'IE', 'SE', 'IT', 'DE', 'AT', 'SK', 'GR', 'SI',
  'HR', 'FI', 'CY', 'DK', 'LV', 'CZ', 'LT', 'HU',
  'LU', 'EE', 'MT', 'GB',
  'US', 'CA', 'RU',
];

// null values are generated later
const defaultFbAttrs = {
  id: null,
  title: null,
  description: null,
  google_product_category: 'Home & Garden > Decor > Artwork Posters, Prints, & Visual Artwork',
  product_type: 'Home & Garden > Decor > Artwork Posters, Prints, & Visual Artwork',
  link: null,
  image_link: null,
  condition: 'new',
  availability: 'in stock',
  price: null,
  brand: 'Alvar Carto',
  item_group_id: null,
  color: null,
  size: null,
  // shipping: _.map(countries.getNames('en'), (n, code) => `${code}::Standard:0 EUR`).join(','),
  shipping: 'FI::Standard:0 EUR',
  custom_label_0: 'Designed and manufactured in Finland',
};

// geonameid  name  asciiname alternatenames  latitude  longitude feature class feature code  country code  cc2 admin1 code admin2 code admin3 code admin4 code population  elevation dem timezone  modified
function transform(matrix) {
  const rows = _.filter(_.tail(matrix), row => !_.isEmpty(row[0]));
  const cities = _.map(rows, row => ({
    id: latLngToCityId(Number(row[4]), Number(row[5])),
    name: row[1],
    lat: Number(row[4]),
    lng: Number(row[5]),
    countryCode: row[8].toUpperCase(),
    population: Number(row[14]),
    modified: moment(row[18], 'YYYY-MM-DD'),
  }));

  const filteredCities = _.filter(cities, c => c.population > 50000 && _.includes(USE_COUNTRIES, c.countryCode));

  const cityIds = _.map(filteredCities, 'id');
  const posterStyleIds = _.map(common.POSTER_STYLES, 'id');
  const mapStyleIds = _.map(common.MAP_STYLES, 'id');
  const sizeIds = ['30x40cm'];
  const orientationIds = ['portrait'];

  const cp = combinatorics.cartesianProduct(cityIds, posterStyleIds, mapStyleIds, sizeIds, orientationIds);
  const combinationsArr = cp.toArray();
  console.error(`Found ${filteredCities.length} cities. Total combinations: ${combinationsArr.length}.`);

  const allResults = _.map(combinationsArr, ([cityId, posterStyleId, mapStyleId, sizeId, orientationId]) => {
    const combination = {
      city: _.find(cities, { id: cityId }),
      posterStyle: _.find(common.POSTER_STYLES, { id: posterStyleId }),
      mapStyle: _.find(common.MAP_STYLES, { id: mapStyleId }),
      sizeId,
      orientationId,
    };

    return {
      product: combinationToProduct(combination),
      combination,
    };
  });

  const results = filterUnavailableProducts(allResults);
  console.error(`Total amount of real products: ${results.length}.`);

  return BPromise.map(results, (result) => {
    const { city, posterStyle, mapStyle } = result.combination;
    console.error(`Processing ${city.name} (${city.id}), ${posterStyle.id}, ${mapStyle.id} ..`);
    return transformProductAsync(result);
  }, { concurrency: 1 })
  .then((products) => {
    const headers = _.keys(products[0]);
    return [headers].concat(_.map(products, (product) => {
      return _.map(headers, key => product[key]);
    }));
  });
}

function filterUnavailableProducts(results) {
  return _.filter(results, (result) => {
    const { posterStyle, mapStyle } = result.combination;
    if (!_.isArray(posterStyle.allowedMapStyles)) {
      return true;
    }

    return _.includes(posterStyle.allowedMapStyles, mapStyle.id);
  });
}

function combinationToProduct(comb) {
  const attrs = {
    // 0/SHARP/FFFFFF/50X70C/0/60.169/24.935
    id: [
      0,  // ID version 0
      comb.posterStyle.id.toUpperCase(),
      _.trimStart(comb.mapStyle.color, '#').toUpperCase(),
      comb.orientationId[0].toUpperCase(),
      comb.sizeId.toUpperCase(),
      0, // Paper weight, 0 -> Printmotor's default
      comb.city.id,
    ].join('/'),
    title: comb.city.name,
    description: `${randomNiceAdjective(comb.city.id)} poster of ${comb.city.name}`,
    link: createProductLink({
      lat: comb.city.lat,
      lng: comb.city.lng,
      zoom: 10,
      size: comb.sizeId,
      orientation: comb.orientationId,
      posterStyle: comb.posterStyle.id,
      mapStyle: comb.mapStyle.id,
      labelsEnabled: true,
      labelHeader: comb.city.name,
      labelSmallHeader: countries.getName(comb.city.countryCode, 'en'),
      labelText: coordToPrettyText({ lat: comb.city.lat, lng: comb.city.lng }),
    }),
    image_link: null,  // Generated later
    price: getPrice({ size: comb.sizeId, quantity: 1 }),
    item_group_id: comb.posterStyle.id.toUpperCase(),
    color: comb.mapStyle.name,
    size: comb.sizeId,
  };

  return _.merge({}, defaultFbAttrs, attrs);
}

function transformProductAsync(result) {
  const { product, combination } = result;

  return cachingGeocode({
    address: combination.city.name,
    components: {
      country: combination.city.countryCode,
    },
  })
  .then((data) => {
    // Fix to return only city
    const bounds = data.results[0].geometry.viewport;

    return _.merge({}, product, {
      image_link: createImageLink({
        neLat: bounds.northeast.lat,
        neLng: bounds.northeast.lng,
        swLat: bounds.southwest.lat,
        swLng: bounds.southwest.lng,
        size: combination.sizeId,
        orientation: combination.orientationId,
        posterStyle: combination.posterStyle.id,
        mapStyle: combination.mapStyle.id,
        labelsEnabled: true,
        labelHeader: combination.city.name,
        labelSmallHeader: countries.getName(combination.city.countryCode, 'en'),
        labelText: coordToPrettyText({ lat: combination.city.lat, lng: combination.city.lng }),
        background: 'facebook-carousel',
        frames: 'black',
        resizeToHeight: 1080,
      }),
    });
  });
}

function getPrice(item) {
  const price = calculateItemPrice(item);
  return `${price.humanValue} ${price.currency}`;
}

function createProductLink(params) {
  const query = qs.stringify(params);
  return `https://design.alvarcarto.com?${query}`;
}

function createImageLink(params) {
  const query = qs.stringify(params);
  return `${config.RENDER_API_URL}/api/raster/placeit?${query}`;
}

function randomNiceAdjective(cityId) {
  return randomChoice([
    'Beautiful',
    'Unique',
    'Stylish',
    'Gorgeous',
  ], { seed: cityId });
}

function randomChoice(arr, opts = {}) {
  const rng = seedrandom(opts.seed);
  const index = Math.floor(rng() * arr.length);
  return arr[index];
}

function latLngToCityId(lat, lng) {
  return `${lat.toFixed(3)}L${lng.toFixed(3)}`;
}

module.exports = transform;

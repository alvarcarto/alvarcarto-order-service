const _ = require('lodash');
const qs = require('qs');
const seedrandom = require('seedrandom');
const BPromise = require('bluebird');
const moment = require('moment');
const countries = require('i18n-iso-countries');
const combinatorics = require('js-combinatorics');
const { calculateItemPrice } = require('alvarcarto-price-util');
const common = require('alvarcarto-common');
const { getBoundsZoom, LatLng, LatLngBounds } = require('@alvarcarto/mapsy');
const { coordToPrettyText } = require('./util');
const cachingGeocode = require('./caching-geocode');

if (!process.env.PLACEMENT_API_URL) {
  throw new Error('Invalid PLACEMENT_API_URL');
}

const IMPORTANT_COUNTRIES = [
  'FI', 'SE', 'GB', 'FR', 'IT', 'NO', 'DK', 'DE',
]
const EUROPE_COUNTRIES = [
  'AD', 'AL', 'AT', 'AX', 'BA', 'BE', 'BG', 'BY',
  'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
  'GB', 'GG', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM',
  'IT', 'JE', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD',
  'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO',
  'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'TR', 'UA',
  'VA', 'XK', 'IE', 'CY', 'MC',
];
const USE_COUNTRIES = EUROPE_COUNTRIES.concat([
  'NO', 'US', 'CA', 'RU', 'CN',
  'BZ', 'AE', 'MX',
]);

// null values are generated later
const defaultFbAttrs = {
  id: null,
  title: null,
  description: null,
  google_product_category: '500044', // 'Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork',
  product_type: 'Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork',
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
  shipping: 'FI::Standard:0.00 EUR',
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

  const filteredCities = _.filter(cities, (c) => {
    const isNormal = _.includes(USE_COUNTRIES, c.countryCode) && c.population > 100000;
    const isImportant = _.includes(IMPORTANT_COUNTRIES, c.countryCode) && c.population > 80000;
    return isNormal || isImportant;
  });

  const cityIds = _.map(filteredCities, 'id');
  const posterStyleIds = ['sharp', 'classic', 'sans', 'bw'];
  const mapStyleIds = ['bw', 'gray', 'black', 'copper', 'petrol'];
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

function roundToStep(value, step) {
  return ((Math.round(value / step)) * step);
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
    link: null,  // Generated later
    image_link: null,  // Generated later
    price: getPrice({ size: comb.sizeId, quantity: 1 }),
    item_group_id: comb.city.id,
    color: comb.mapStyle.name,
    size: comb.sizeId,
  };

  return _.merge({}, defaultFbAttrs, attrs);
}

function transformProductAsync(result) {
  const { product, combination } = result;

  let data;
  return cachingGeocode({
    address: combination.city.name,
    components: {
      country: combination.city.countryCode,
    },
  })
  .then((_data) => {
    data = _data;
    // Fix to return only city
    const bounds = data.results[0].geometry.viewport;
    const ne = new LatLng(bounds.northeast.lat, bounds.northeast.lng);
    const sw = new LatLng(bounds.southwest.lat, bounds.southwest.lng);
    const latLngBounds = new LatLngBounds(ne, sw);
    const center = latLngBounds.getCenter();
    // Pixels taken from here: https://github.com/kimmobrunfeldt/alvarcarto-designer/blob/master/src/util/index.js
    const zoom = getBoundsZoom(latLngBounds, { width: 375, height: 500 });
    return _.merge({}, product, {
      link: createProductLink({
        lat: center.lat,
        lng: center.lng,
        zoom: roundToStep(zoom, 0.25),  // Our leaflet map allows 0.25 zoom steps
        size: combination.sizeId,
        orientation: combination.orientationId,
        posterStyle: combination.posterStyle.id,
        mapStyle: combination.mapStyle.id,
        labelsEnabled: true,
        labelHeader: combination.city.name,
        labelSmallHeader: countries.getName(combination.city.countryCode, 'en'),
        labelText: coordToPrettyText({ lat: combination.city.lat, lng: combination.city.lng }),
      }),
      image_link: createImageLink({
        placementId: randomPlacementId(combination.city.id, combination.posterStyle.id, combination.mapStyle.id),
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
        resizeToWidth: 1080,
      }),
    });
  })
  .catch((err) => {
    console.error('Data:', data);
    throw err;
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
  const query = qs.stringify(_.omit(params, ['placementId']));
  return `${process.env.PLACEMENT_API_URL}/api/place-map/${params.placementId}?${query}`;
}

function randomNiceAdjective(cityId) {
  return randomChoice([
    'Beautiful',
    'Unique',
    'Stylish',
    'Gorgeous',
  ], { seed: cityId });
}


function randomPlacementId(cityId, posterStyle, mapStyle) {
  const choices = [
    'green-hearted-coffee-square',
    'flowers-in-blue-black-frame-square',
    'black-brick-wall-above-table-square',
  ];
  if (posterStyle !== 'bw') {
    choices.push('flatlay-flowers-shop-square');
  }

  // Same city and same posterStyle will always lead to same placement, but it's random
  return randomChoice(choices, { seed: `${cityId}${posterStyle}${mapStyle}` });
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

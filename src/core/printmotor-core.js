const BPromise = require('bluebird');
const _ = require('lodash');
const { calculateItemPrice, isEuCountry } = require('alvarcarto-price-util');
const request = require('request-promise');
const config = require('../config');
const logger = require('../util/logger')(__filename);
const {
  toLog, resolveProductionClass, resolveShippingClass, filterMapPosterCart,
} = require('../util');
const { uploadPoster } = require('./bucket-core');

const BASE_URL = [
  'https://',
  config.PRINTMOTOR_USER,
  ':',
  config.PRINTMOTOR_PASSWORD,
  '@',
  config.PRINTMOTOR_HOST,
].join('');

function createOrder(internalOrder) {
  const mapCart = filterMapPosterCart(internalOrder.cart);

  return BPromise.map(mapCart, (item, i) => uploadPoster(internalOrder, item, i), {
    concurrency: 1,
  })
    .then((imageUrls) => {
      const params = {
        method: 'POST',
        url: `${BASE_URL}/api/v1/order`,
        json: true,
        headers: {
          'X-Printmotor-Service': config.PRINTMOTOR_SERVICE_ID,
        },
        body: _internalOrderToPrintmotorOrder(internalOrder, imageUrls),
      };

      logger.logEncrypted(
        'info',
        `Printmotor request (#${internalOrder.orderId}):`,
        params,
      );

      return BPromise.props({
        response: request(params),
        requestParams: params,
      });
    })
    .catch((err) => {
      logger.logEncrypted(
        'error',
        `Error creating order to Printmotor (#${internalOrder.orderId}): ${err}`,
        `Detailed error: ${err}, body: ${toLog(_.get(err, 'response.body'))}`,
      );

      throw err;
    });
}

function getOrder(printmotorOrderId) {
  const params = {
    method: 'GET',
    url: `${BASE_URL}/api/v1/order/${printmotorOrderId}`,
    json: true,
    headers: {
      'X-Printmotor-Service': config.PRINTMOTOR_SERVICE_ID,
    },
  };

  return request(params);
}

function isOrderInProduction(printmotorOrder) {
  return _.includes(['RECEIVED', 'IN_PRODUCTION'], _.get(printmotorOrder, 'processingStatus'));
}

function getDeliveryEstimate(countryCode, cart) {
  const productionClass = resolveProductionClass(cart);

  const regularProduction = {
    min: 2,
    max: 4,
    timeUnit: 'BUSINESS_DAY',
  };
  const highProduction = {
    min: 0,
    max: 1,
    timeUnit: 'BUSINESS_DAY',
  };

  const production = productionClass === 'HIGH' ? highProduction : regularProduction;

  // Shipping class is expected to be EXPRESS currently
  let delivery;
  if (countryCode === 'FI') {
    delivery = {
      min: 1,
      max: 3,
      timeUnit: 'BUSINESS_DAY',
    };
  } else if (isEuCountry(countryCode)) {
    delivery = {
      min: 1,
      max: 3,
      timeUnit: 'BUSINESS_DAY',
    };
  } else if (countryCode === 'US') {
    // "North America" is simplified here
    delivery = {
      min: 2,
      max: 4,
      timeUnit: 'BUSINESS_DAY',
    };
  } else {
    delivery = {
      min: 3,
      max: 5,
      timeUnit: 'BUSINESS_DAY',
    };
  }

  return {
    production,
    delivery,
    total: {
      min: production.min + delivery.min,
      max: production.max + delivery.max,
      timeUnit: 'BUSINESS_DAY',
    },
  };
}

function _internalOrderToPrintmotorOrder(internalOrder, imageUrls) {
  const nameParts = _splitFullName(internalOrder.shippingAddress.personName);
  const mapCart = filterMapPosterCart(internalOrder.cart);
  return {
    address: {
      recipientName: internalOrder.shippingAddress.personName,
      name: internalOrder.shippingAddress.personName,
      recipientPhone: internalOrder.shippingAddress.contactPhone || '',
      address: internalOrder.shippingAddress.streetAddress,
      address2: internalOrder.shippingAddress.streetAddressExtra || '',
      countryIso2: internalOrder.shippingAddress.countryCode,
      postalArea: internalOrder.shippingAddress.city,
      postalCode: internalOrder.shippingAddress.postalCode,
      state: internalOrder.shippingAddress.state || '',
    },
    meta: {
      reference: internalOrder.orderId,
    },
    orderer: {
      emailAddress: internalOrder.email,
      firstName: nameParts.first,
      lastName: nameParts.last,
      phone: internalOrder.shippingAddress.contactPhone || '',
    },
    products: _.map(mapCart, (item, i) => {
      return _internalCartItemToPrintmotorProduct(item, imageUrls[i], internalOrder.currency);
    }),
    postalClass: _getPostalClass(internalOrder),
    productionClass: _getProductionClass(internalOrder),
  };
}

// From Printmotor error:
// Possible sizes: 'A4', '30x40', 'A3', '40x50', 'A2', '50x70', 'A1', '70x100',
//                 '12x18inch', '16x20inch', '18x24inch', '24x36inch'.
function sizeToPrintmotorSize(size) {
  if (size.indexOf('cm') !== -1) {
    return size.split('cm')[0];
  }

  return size;
}

function _internalCartItemToPrintmotorProduct(item, imageUrl, currency) {
  const price = calculateItemPrice(item, { onlyUnitPrice: true, currency });
  const mapItem = item.customisation;

  return {
    product: mapItem.material === 'plywood' ? 'plywood-sheet-6mm' : 'matt-poster',
    amount: item.quantity,
    size: sizeToPrintmotorSize(mapItem.size),
    orientation: mapItem.orientation,
    // layoutName: _getLayoutName(mapItem.size, mapItem.orientation),
    customization: [
      {
        fieldName: 'image',
        value: imageUrl,
      },
    ],
    endUserPrice: {
      currencyIso4217: price.currency.toUpperCase(),
      priceValue: price.humanValue,
    },
  };
}

function _splitFullName(name) {
  const splitted = name.split(' ');
  const lastName = splitted.pop();
  return {
    first: splitted.join(' '),
    last: lastName,
  };
}

function _getLayoutName(size, orientation) {
  if (orientation === 'landscape') {
    return _getLandscapeLayoutName(size);
  }

  return _getPortraitLayoutName(size);
}

function _getLandscapeLayoutName(size) {
  switch (size) {
    case '30x40cm':
      return 'api-poster-40x30';
    case '50x70cm':
      return 'api-poster-70x50';
    case '70x100cm':
      return 'api-poster-100x70';
    case '12x18inch':
      return 'api-poster-18inchx12inch';
    case '18x24inch':
      return 'api-poster-24inchx18inch';
    case '24x36inch':
      return 'api-poster-36inchx24inch';
    default:
  }

  throw new Error(`Unknown size: ${size}`);
}

function _getPortraitLayoutName(size) {
  switch (size) {
    case '30x40cm':
      return 'api-poster-30x40';
    case '50x70cm':
      return 'api-poster-50x70';
    case '70x100cm':
      return 'api-poster-70x100';
    case '12x18inch':
      return 'api-poster-12inchx18inch';
    case '18x24inch':
      return 'api-poster-18inchx24inch';
    case '24x36inch':
      return 'api-poster-24inchx36inch';
    default:
  }

  throw new Error(`Unknown size: ${size}`);
}

function _getPostalClass(internalOrder) {
  const className = resolveShippingClass(internalOrder.cart);
  if (!className) {
    return 'EXPRESS';
  }

  return className;
}

function _getProductionClass(internalOrder) {
  if (_.get(internalOrder, 'promotion.promotionCode') === 'EXPRESS') {
    return 'HIGH';
  }

  const className = resolveProductionClass(internalOrder.cart);
  if (!className) {
    return 'REGULAR';
  }

  return className;
}

module.exports = {
  createOrder,
  getOrder,
  getDeliveryEstimate,
  isOrderInProduction,
  BASE_URL,
};

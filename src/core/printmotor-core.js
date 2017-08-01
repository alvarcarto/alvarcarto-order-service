const BPromise = require('bluebird');
const _ = require('lodash');
const { calculateItemPrice } = require('alvarcarto-price-util');
const request = require('request-promise');
const config = require('../config');
const logger = require('../util/logger')(__filename);
const { toLog } = require('../util');
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
  return BPromise.map(internalOrder.cart, (item, i) => uploadPoster(internalOrder, item, i), {
    concurrency: 3,
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
        params
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
        `Detailed error: ${err}, body: ${toLog(_.get(err, 'response.body'))}`
      );

      throw err;
    });
}

function _internalOrderToPrintmotorOrder(internalOrder, imageUrls) {
  const nameParts = _splitFullName(internalOrder.shippingAddress.personName);
  return {
    address: {
      recipientName: internalOrder.shippingAddress.personName,
      name: internalOrder.shippingAddress.personName,
      recipientPhone: internalOrder.shippingAddress.contactPhone || '',
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
      phone: internalOrder.shippingAddress.contactPhone || '',
    },
    products: _.map(internalOrder.cart, (item, i) =>
      _internalCartItemToPrintmotorProduct(item, imageUrls[i])
    ),
  };
}

function _internalCartItemToPrintmotorProduct(item, imageUrl) {
  const price = calculateItemPrice(item, { onlyUnitPrice: true });
  return {
    amount: item.quantity,
    layoutName: _getLayoutName(item.size, item.orientation),
    customization: [
      {
        fieldName: 'image',
        value: imageUrl,
      },
    ],
    endUserPrice: {
      currencyIso4217: price.currency.toUpperCase(),
      priceValue: (price.value / 100.0).toFixed(2),
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
  }

  throw new Error(`Unknown size: ${size}`);
}

module.exports = {
  createOrder,
};

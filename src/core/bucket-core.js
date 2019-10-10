const BPromise = require('bluebird');
const _ = require('lodash');
const request = require('request-promise');
const prettyBytes = require('pretty-bytes');
const { oneLine } = require('common-tags');
const { s3 } = require('../util/aws');
const logger = require('../util/logger')(__filename);
const { createPosterImageUrl } = require('../util');
const config = require('../config');

// Download image from Alvar Carto render API, and then upload it to S3
function uploadPoster(order, item, itemId) {
  if (config.SKIP_S3_POSTER_UPLOAD) {
    logger.info(oneLine`
      Skipping S3 poster upload
      for order #${order.orderId}, item ${itemId}
      and assuming it has been uploaded manually ..
    `);

    return BPromise.resolve(_createS3Url(order.orderId, itemId));
  }

  const posterApiUrl = createPosterImageUrl(item);
  logger.info(`Downloading poster from "${posterApiUrl}" ..`);

  return request({
    url: posterApiUrl,
    headers: {
      'x-api-key': config.RENDER_API_KEY,
    },
    timeout: 300 * 1000,
    encoding: null,
    resolveWithFullResponse: true,
  })
    .then((res) => {
      if (_.has(res.headers, 'content-length')) {
        const bytes = parseInt(res.headers['content-length'], 10);
        logger.info(`Downloaded ${prettyBytes(bytes)} data`);
      } else {
        logger.info('Downloaded data, but content-length was not defined. Cloudflare URL was possibly used.');
      }

      const params = {
        // create unique file name id
        Bucket: config.AWS_S3_BUCKET_NAME,
        ACL: 'public-read',
        Key: `posters/${order.orderId}-item${itemId}.png`,
        ContentType: 'image/png',
        Body: res.body,
        Metadata: {
          orderId: order.orderId,
        },
      };

      return s3.uploadBluebirdAsync(params);
    })
    .tap(data => logger.info(`Uploaded poster to S3: ${data.Location}`))
    .then(response => response.Location)
    .catch((err) => {
      logger.error(`Error uploading poster to S3: ${err} Body: ${_.get(err, 'response.body')}`);
      throw err;
    });
}

function _createS3Url(orderId, itemId) {
  return [
    `https://s3-${config.AWS_REGION}.amazonaws.com/`,
    config.AWS_S3_BUCKET_NAME,
    '/',
    `posters/${orderId}-item${itemId}.png`,
  ].join('');
}

module.exports = {
  uploadPoster,
  s3,
};

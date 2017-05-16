const request = require('request-promise');
const prettyBytes = require('pretty-bytes');
const { createS3 } = require('../util/aws');
const logger = require('../util/logger')(__filename);
const { createPosterImageUrl } = require('../util');
const config = require('../config');

const s3 = createS3();

// Download image from Alvar Carto render API, and then upload it to S3
function uploadPoster(order, item, itemId) {
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
    const bytes = parseInt(res.headers['content-length'], 10);
    logger.info(`Downloaded ${prettyBytes(bytes)} data`);

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

    return s3.uploadAsync(params);
  })
  .tap(data => logger.info(`Uploaded poster to S3: ${data.Location}`))
  .catch((err) => {
    logger.error(`Error uploading poster to S3: ${err}`);
    throw err;
  });
}

module.exports = {
  uploadPoster,
};

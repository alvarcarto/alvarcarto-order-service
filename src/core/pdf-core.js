const request = require('request-promise');
const config = require('../config');
const logger = require('../util/logger')(__filename);

function getPdf(url) {
  const params = {
    method: 'GET',
    url: `${config.PDF_API_URL}/convert`,
    query: {
      url,
    },
    encoding: null,
    timeout: 300 * 1000,
    encoding: null,
    resolveWithFullResponse: true,
  };

  return request(params);
    .catch((err) => {
      logger.error(`Error when trying to get PDF: ${err}`);
      throw err;
    });
}

module.exports = {
  getPdf,
};

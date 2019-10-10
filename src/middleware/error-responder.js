const http = require('http');
const _ = require('lodash');

// This reponder is assuming that all <500 errors are safe to be responded
// with their .message attribute.
// DO NOT write sensitive data into error messages.
function createErrorResponder(_opts) {
  const opts = _.merge({
    isErrorSafeToRespond(status) {
      return status < 500;
    },
  }, _opts);

  return function errorResponder(err, req, res) {
    let message;
    let status = err.status ? err.status : 500;
    switch (err.type) {
      case 'StripeCardError':
        // A declined card error
        status = 402;
        break;
      case 'StripeInvalidRequestError':
        status = 402;
        break;
      case 'StripeConnectionError':
        status = 503;
        break;
      case 'StripeRateLimitError':
        status = 429;
        break;
      default:
        break;
    }

    const httpMessage = http.STATUS_CODES[status];
    if (opts.isErrorSafeToRespond(status)) {
      message = err.message;
    } else {
      message = httpMessage;
    }

    const isPrettyValidationErr = _.has(err, 'errors');
    const body = isPrettyValidationErr
      ? err
      : { status, statusText: httpMessage, errors: [{ messages: [message] }] };

    res.status(status);
    res.json(body);
  };
}

module.exports = createErrorResponder;

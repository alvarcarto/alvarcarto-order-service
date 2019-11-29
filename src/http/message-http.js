const ex = require('../util/express');
const messageHttp = require('../core/message-core');

const getCurrentMessage = ex.createJsonRoute(() => {
  return messageHttp.getCurrentMessage()
    .then((promotion) => {
      if (!promotion) {
        return ex.throwStatus(404, 'Message not found');
      }

      return promotion;
    });
});

module.exports = {
  getCurrentMessage,
};


module.exports = function (app, extraHeaders) {

  // Cache the wrapper instances
  var webCreate, netCreate;

  return function (emit) {
    // This will be the write function.
    var write;

    return decoder;

    function decoder(chunk) {
      if (!write) init(chunk);
      write(chunk);
    }

    function init(chunk) {
      // In raw protocol the first byte is required to be under 0x40
      // Otherwise assume it's an HTTP request as part of websocket
      // `GET` starts with 0x47 as the first byte.
      if (chunk[0] >= 0x40) {
        // Lazy create the wrapper instance for this app using websocket server
        if (!webCreate) {
          var wsWrap = require('./websocket-channel').wrap;
          var serverWrap = require('websocket-codec/server');
          webCreate = serverWrap(wsWrap(app, true), extraHeaders);
        }
        write = webCreate(emit);
      }
      else {
        // Lazy create the wrapper instance for this app using raw framing
        if (!netCreate) {
          var tcpWrap = require('./tcp-channel').wrap;
          netCreate = tcpWrap(app, true);
        }
        write = netCreate(emit);
      }
    }
  };
};

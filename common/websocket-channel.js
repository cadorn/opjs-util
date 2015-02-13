var bodec = require('bodec');

exports.decoder = decoder;
exports.encoder = encoder;
exports.wrap = wrap;

// Wrap a websocket transport to auto encode/decode channel headers.
// If the first client-send message is a binary value with the first four bytes
// being all zero, then we assume channel mode.

// `app` speaks in { channel: <number>, body: <binary> } objects.
// `channeledApp` speaks in <binary> with channel embedded as first 4 bytes.
// It will guess if the protocol is using channel if `hasChannel` is undefined
// by looking at the first 4 bytes of the first message to see if they are all
// zero.
function wrap(app, hasChannel) {
  if (!hasChannel) return app; // If channel is explicitly disabled, skip all this.
  return channeledApp;

  function channeledApp(emit) {
    return decoder(app(encoder(emit, hasChannel)), hasChannel);
  }
}

function decoder(emit, hasChannel) {
  return decode;

  function decode(item) {
    // Pass EOS through
    if (item === undefined) return emit();

    if (hasChannel === undefined) hasChannel = guessChannel(item);

    // Pass items through when not in channel mode.
    if (!hasChannel) return emit(item);

    if (!bodec.isBinary(item) || item.length < 4) {
      throw new TypeError("expected binary at least 4 bytes long in channel mode");
    }

    // Parse out the channel info from the first 4 bytes.
    emit({
      channel:
        ((item[0] << 24) |
         (item[1] << 16) |
         (item[2] << 8) |
         (item[3] << 0)) >>> 0,
      body: bodec.slice(item, 4)
    });
  }
}

function guessChannel(item) {
  if (typeof item === "string") return false;
  if (!bodec.isBinary(item)) {
    throw new TypeError("Expected string or binary");
  }
  // If the first 4 bytes in the first message body are 0, assume channel mode
  return item.length >= 4 &&
         item[0] === 0 &&
         item[1] === 0 &&
         item[2] === 0 &&
         item[3] === 0;
}

function encoder(emit, hasChannel) {
  return function (item) {
    // Pass EOS through
    if (item === undefined) return emit();

    // Pass primitives through
    if (typeof item === "string" || bodec.isBinary(item)) {
      if (hasChannel === undefined) {
        hasChannel = false;
      }
      if (hasChannel) {
        throw new TypeError("Primitive sent in channel mode");
      }
      return emit(item);
    }

    if (hasChannel === undefined) {
      hasChannel = true;
    }
    if (!hasChannel) {
      throw new TypeError("String or binary expected in non-channel mode");
    }

    // Encode {channel,body} objects with 4-byte channel header
    if (typeof item.channel !== "number") {
      throw new TypeError("channel property must be number");
    }
    if (!bodec.isBinary(item.body)) {
      throw new TypeError("body property must be binary");
    }
    var head = bodec.create(4 + item.body.length);
    head[0] = item.channel >> 24 & 0xff;
    head[1] = item.channel >> 16 & 0xff;
    head[2] = item.channel >> 8 & 0xff;
    head[3] = item.channel >> 0 & 0xff;
    bodec.copy(item.body, head, 4);
    emit(head);
  };
}

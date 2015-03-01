var bodec = require('bodec');

// This module is a stream transform that converts between raw binary stream
// chunks and { channel, body } objects.
// This module is sync and can thus be easily integrated into async streams
// that require backpressure.

// The framing protocol is very simple and is designed to be used on top of an
// existing TCP stream.

// Framing format is:
// [4 byte channel][4 byte size][variable length body]
// Where numbers are encoded as network byte order unsigned integers.

// Decode from raw stream to objects
exports.decoder = decoder;
// Encode object stream to framed stream
exports.encoder = encoder;

exports.wrap = wrap;

// Inner `app` speaks in { channel: <number>, body: <binary> } objects
// Outer app speaks in <binary> chunks split up at arbitrary points.
// This outer protocol embeds the channel and length in an 8 byte header.
function wrap(app, hasChannel) {
  if (typeof app !== "function" || typeof hasChannel !== "boolean") {
    throw new TypeError("Wrong types for wrap(<function>, <boolean>)");
  }
  return function (emit) {
    return decoder(app(encoder(emit, hasChannel)), hasChannel);
  };
}

// This stream transform accepts arbitrarly sized binary chunks and runs them
// through a state-machine parser that emits re-assembled messages.
function decoder(emit, hasChannel) {
  // 0 - channel, 1 - length, 2 - body
  var state;
  // Offset within body and bit offset within number
  var offset;
  // Storage for channel and length parsed value
  var channel, length;
  // Will hold binary instance after length is known
  var body;

  // Initialize the state-machine
  reset();

  return decode;

  function reset() {
    state = hasChannel ? 0 : 1;
    offset = 24;
    channel = 0;
    length = 0;
    body = null;
  }

  function decode(chunk) {

    // Pass through falsy values (including undefined for EOS)
    if (!chunk) return emit(chunk);

    if (!bodec.isBinary(chunk)) {
      throw new TypeError("chunk must be binary value");
    }

    // Parse the chunk using the state machine
    var l = chunk.length;
    var i = 0;
    while (i < l) {
      // Uncomment this to debug the state machine
      // console.log("S:" + state +
      //           " B:" + chunk[i].toString(16) +
      //           " O:" + offset +
      //           " C:" + (channel>>>0).toString(16) +
      //           " L:" + (length>>>0).toString(16)
      // );

      // Channel and length states simply interpret the UINT32BE bytes
      if (state === 0) {
        channel |= chunk[i] << offset;
        if (offset) {
          offset -= 8;
        }
        else {
          // Make sure channel is interpreted as unsigned in JavaScript
          // Since the << above will convert to a signed 32-bit integer
          channel = channel >>> 0;

          if (channel >= 0x40000000) {
            throw new Error("Channel must be smaller than 0x40000000. Got: " + channel);
          }
          state = 1;
          offset = 24;
        }
        i++;
        continue;
      }
      if (state === 1) {
        length |= chunk[i] << offset;
        if (offset) {
          offset -= 8;
        }
        else {
          // Make sure length is interpreted as unsigned in JavaScript
          length = length >>> 0;
          if (length >= 0x40000000) {
            throw new Error("Length must be smaller than 0x40000000. Got: " + length);
          }
          body = bodec.create(length);
          if (length) {
            state = 2;
            offset = 0;
          }
          else {
            // Special case for empty bodies.
            flush();
          }
        }
        i++;
        continue;
      }

      // For the body state, copy as large a chunk as possible.
      var len = Math.min(length - offset, l - i);
      bodec.copy(bodec.slice(chunk, i, i + len), body, offset);
      // Update the offset pointers
      offset += len;
      i += len;

      // And flush to emit the object and reset state
      if (offset >= length) flush();

    }
  }

  function flush() {
    // We need to store the output value before resetting...
    var object;
    if (hasChannel) {
      console.log("RECEIVED ON CHANNEL [" + channel + "]:", body.length);
      object = {
        channel: channel,
        body: body
      };
    }
    else {
      object = body;
    }
    // And we need to reset before emitting...
    reset();
    // Since emit *could* trigger re-entrancy into the state machine.
    emit(object);
  }

}

// Implements a simple stream transform that accepts objects and outputs binary
// chunks.  In this implementation each input object will result in two output
// chunks, one for headers and one for the actual payload.  It's up to the
// consumer of this library to join many small chunks if desired.
function encoder(emit, hasChannel) {

  // Make sure an emit function was passed in.
  if (typeof emit !== "function") {
    throw new TypeError("emit must be function");
  }

  // Return an encode function that can be used to write to this filter.
  return function (object) {

    // Pass through falsy values (including undefined for EOS)
    if (!object) return emit(object);

    // Auto-detect channel mode if not specified.
    if (hasChannel === undefined) {
      hasChannel = !bodec.isBinary(object);
    }

    var channel, body;
    if (hasChannel) {
      if (typeof object.channel !== "number" || !bodec.isBinary(object.body)) {
        throw new TypeError("object must be { channel: <number>, body: <binary> } format");
      }
      channel = object.channel;
      body = object.body;
      console.log("SENDING ON CHANNEL [" + channel + "]:", body.length);
    }
    else {
      if (!bodec.isBinary(object)) {
        throw new TypeError("item must be binary value");
      }
      body = object;
    }

    var length = body.length;
    var array;

    if (hasChannel) {
      // Write channel and length header as 32-bit unsigned big endian numbers.
      array = [
        (channel >> 24 & 0xff),
        (channel >> 16 & 0xff),
        (channel >> 8 & 0xff),
        (channel >> 0 & 0xff),
        (length >> 24 & 0xff),
        (length >> 16 & 0xff),
        (length >> 8 & 0xff),
        (length >> 0 & 0xff)
      ];
    }
    else {
      // Write just the length in non-channel mode
      array = [
        (length >> 24 & 0xff),
        (length >> 16 & 0xff),
        (length >> 8 & 0xff),
        (length >> 0 & 0xff)
      ];
    }
    emit(bodec.fromArray(array));

    // Write the raw body if there is one
    if (length) emit(body);
  };

}

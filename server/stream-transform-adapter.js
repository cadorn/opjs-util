

var Transform = require('stream').Transform;

module.exports = adapter;

function adapter(transform) {

  console.log("SOCKET START");

  var streamEnded = false;
  var piece = new Transform();

  var write = transform(function (out) {

    if (out === undefined) {
      console.log("SOCKET END");
      streamEnded = true;
      piece.end();
    }
    else
    if (streamEnded) {
      console.log("IGNORE SEND OUT", pretty(out), "[[", out, "]]", "DUE TO SOCKET END");
      if (typeof out.length === 8) {
        for (var i = 0, l = out.length; i < l; i++) {
          console.log("SEND OUT out[" + i + "]", out[i]);
        }
      }
    }
    else {
      console.log("SEND OUT", pretty(out), "[[", out, "]]");

      // Do we need to do anything special when out is an object and not a buffer
      piece.push(out);
    }
  });

  piece._transform = function (chunk, encoding, callback) {
    // console.log("in", pretty(chunk));
    // What about object mode, should we do anything with encoding?
    try { write(chunk); }
    catch (err) { return callback(err); }
    callback();
  };

  piece._flush = function (callback) {
    // Sending undefined into the transform signifies end of stream.
    try { write(); }
    catch (err) { return callback(err); }
    callback();
  };

  return piece;
}

function pretty(data) {
  if (!data) return data;
  if (data.length === 8) {
    // assuming header
    var line = [];
    for (var i = 0, l = data.length; i < l; i++) {
      line.push(data[i]);
    }
    return line.join(" ");
  }
  for (var i = 0, l = data.length; i < l; i++) {
    var byte = data[i];
    if ((byte < 0x20 && byte !== 0x0d && byte !== 0x0a && byte !== 0x09) || byte >= 0x80) return data;
  }
  return JSON.stringify(data.toString());
}

/* Usage example

require('fs').createReadStream("somefile.txt").pipe(adapter(mytransform)).pipe(stdout);

function mytransform(emit) {
  // Store shared state here in closure
  return function (chunk) {
    // Process chunk and call emit zero or more times before returning
    // Do everything sync.
    // Throw if there is an error
  };
}

*/

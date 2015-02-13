
const Q = require("./q");
const LOGGER = require("./logger");
const EVENTS = require("./events");
const RANDOM = require("./random");


exports.forWindow = function (window) {

	var WindowChannel = function (window) {
		var self = this;
		LOGGER.injectLogger(self, "WindowChannel");

		self._window = window;

		self._lastMessage = null;
		self._window.addEventListener("message", function (event) {
			// We are not interested in events we send ourselves.
			// NOTE: We cannot use `if (event.source === window) return;` as messages may be posted
			//       on our window object from the parent frame.
//if (event.source === window) return;
			if (self._lastMessage === event.data) {
				return;
			}
            try {

	        	var data = event.data;

	        	if (typeof data === "string") {
                	if (!/^\{/.test(event.data)) return;
	                data = JSON.parse(event.data);
	        	}

                self.log("Received", event.data);

                self.emit("message", data, event);

                if (
                    data.result &&
                    data.result.$id
                ) {
                    self.emit("result:" + data.result.$id, data.result);
                }
            } catch (err) {
                console.error("Error delivering message", err.stack);
            }
        }, false);
	}
	WindowChannel.prototype = Object.create(EVENTS.prototype);

	WindowChannel.prototype._sendRaw = function (message) {
		var self = this;
		self._lastMessage = message;
        if (
            self._window.opener &&
            typeof self._window.opener.postMessage === "function"
        ) {
            self.log("send message to window.opener", message);
            // TODO: Only post to specific opener domains.
            self._window.opener.postMessage(message, "*");
        } else
        if (
            self._window.parent &&
            typeof self._window.parent.postMessage === "function"
        ) {
            self.log("send message to window.parent", message);
            // TODO: Only post to specific parent frame domains.
            self._window.parent.postMessage(message, "*");
        } else {
            throw new Error("Unable to message parent window!");
        }
    }

    WindowChannel.prototype.opCall = function (action, handler, method, extra) {
        var self = this;
        if (action === "request") {
            return self.makeRequestTo(handler, method, extra);
        }
        return Q.fcall(function () {
            extra = extra || {};
            var id = extra.id || RANDOM(32);
            var payload = {};
            payload[action] = {
                "$id": id,
                "$handler": handler,
                "$method": method,
                "$timestamp": Math.floor(Date.now()/1000)
            };
            if (extra) {
                for (var key in extra) {
                    payload[action][key] = extra[key];
                }
            }
	        self.log("[request] Send (object):", JSON.stringify(payload, null, 4));
            return self._sendRaw(payload);
        }).fail(function (err) {
            console.error("Error sending message", err.stack);
            throw err;
        });
    }

    WindowChannel.prototype.makeRequestTo = function (handler, method, extra) {
        var self = this;
        try {
            var id = RANDOM(32);
            var payload = {
                "request": {
                    "$id": id,
                    "$handler": handler,
                    "$method": method,
                    "$timestamp": Math.floor(Date.now()/1000)
                }
            };
            if (extra) {
                for (var key in extra) {
                    payload.request[key] = extra[key];
                }
            }
/*
            return layer._apiexplorer_context.request({
                uri: self._windowName,
                data: payload.request
            }).then(function(requestId) {
*/
                var deferred = Q.defer();

                var responseTimeout = null;
                self.once("result:" + id, function(result) {
                    try {
                        // Got response after 
                        if (!responseTimeout) {
                            self.warn("Got error while waiting for result response!");
                            return;
                        }
                        clearTimeout(responseTimeout);
                        responseTimeout = null;

                        //self.log("Received result:", result);

                        if (result.error) {
                            var error = new Error("Gor error '" + result.error.reason["#text"] + "' (code: " + result.error.reason["$id"] + ") while calling '" + self._windowName + "' (handler: " + handler + ", method: " + method + ")");
                            self.error(error.stack);
                            return deferred.reject(error);
                        }
                        return deferred.resolve(result);
                    } catch(err) {
                        return deferred.reject(err);
                    }
                });

                payload = JSON.stringify(payload);

                self._sendRaw(payload);
                responseTimeout = setTimeout(function() {
                    responseTimeout = null;
                    console.error("Timeout waiting for result for request with $id: " + id);
                    // TODO: Remove `self.once("result:" + id)` listener.
                    return deferred.reject(new Error("[ws][" + self._windowName + "] Request timed out"));
                }, 15 * 1000);
                return Q.when(deferred.promise, function (result) {

                	return result;
/*
                    return layer._apiexplorer_context.response(requestId, {
                        data: result
                    }).then(function() {
                        return result;
                    });
*/
                }, function (err) {
                	throw err;
/*
                    return layer._apiexplorer_context.response(requestId, {
                        error: err.code || "ERROR",
                        data: err.stack
                    }).then(function() {
                        throw err;
                    });
*/
                });
//            });
        } catch(err) {
            return Q.reject(err);
        }
    }

	return new WindowChannel(window);
}

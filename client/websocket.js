
const Q = require("./q");
const EVENTS = require("./events");
const RANDOM = require("./random");
const LOGGER = require("./logger");
const WEBSOCKET_CHANNEL = require("./websocket-channel");
const BODEC = require("bodec");


exports.forLayer = function (layer) {

	var exports = {};

	// NOTE: Do NOT comment out `self.error` statements. These are there to catch uncaught errors.
	//		 If an error is expected as part of normal operation then add a `silenceNextError()` method.
	var WS = exports.WS = function (wsUri, options) {
	    var self = this;

	    self.__no_serialize = true;

	    self._options = options;

	    LOGGER.injectLogger(self);


		// Allow listeners to register before opening websocket
		setTimeout(function() {
			// NOTE: `WebSocket` is a browser global
			// @see http://www.websocket.org/
			try {
				self._wsUri = wsUri;
				if (self._options._debug) {
					self.log("[ws][" + self._wsUri + "] Opening socket ...");
				}
				self._socket = new WebSocket(wsUri);
				self._socket.onopen = function(evt) {

				  	var app = WEBSOCKET_CHANNEL.wrap(function (send) {

				  		self._channelSend = send;

						return function onMessage (message) {
							try {
								if (self._options._debug) {
									self.log("[ws][" + self._wsUri + "] Received (message):", message);
								}
								var response = null;
								message = BODEC.toUnicode(message.body);
								self.emit("message-raw", message);
								try {
									response = JSON.parse(message);
								} catch(err) {}
								if (!response) return;
								self.emit("message", response);
								if (!response.result || !response.result.$id) return;
								self.emit("result:" + response.result.$id, response.result);
							} catch(err) {
								self.error("[ws][" + self._wsUri + "] Error delivering `message` event", err.stack);
								throw err;
							}
						}

					}, true);

					var onIn = app(function onOut(buffer) {
						self._socket.send(buffer);
					});

					self._socket.binaryType = 'arraybuffer';
					self._socket.onmessage = function(evt) {
						try {
							if (self._options._debug) {
								self.log("[ws][" + self._wsUri + "] Received (raw):", evt.data);
							}
							onIn(new Uint8Array(evt.data));
						} catch(err) {
							self.error("[ws][" + self._wsUri + "] Error parsing `message` event", err.stack);
							throw err;
						}
					};

					self._socket.onclose = function(evt) {
						try {
							if (self._options._debug) {
								self.log("[ws][" + self._wsUri + "] Closed socket");
							}
							self.emit("close", evt);
						} catch(err) {
							self.error("[ws][" + self._wsUri + "] Error delivering `close` event", err.stack);
							throw err;
						}
					};

					try {
						if (self._options._debug) {
							self.log("[ws][" + self._wsUri + "] Socket open");
						}
						self.emit("open", evt);
					} catch(err) {
						self.error("[ws][" + self._wsUri + "] Error delivering `open` event", err.stack);
						throw err;
					}
				};

				self._socket.onerror = function(evt) {
					try {
						// Ignore error if socket already closed.
						if (self._socket.readyState === self._socket.CLOSING || self._socket.readyState === self._socket.CLOSED) {
							self.log("[ws][" + self._wsUri + "] Socket error:", evt);
							return;
						}
						self.error("[ws][" + self._wsUri + "] Socket error:", evt);
						// TODO: Put some info from `evt` into error message below.
						self.emit("error", new Error("Socket error"));
					} catch(err) {
						self.error("[ws][" + self._wsUri + "] Error delivering `error` event", err.stack);
						throw err;
					}
				};
			} catch(err) {
				self.emit("error", err);
			}
		}, 0);
	}

	WS.prototype = Object.create(EVENTS.prototype);

	WS.prototype.send = function (message, channel) {
		try {
			if (this._options._debug) {
				this.log("[ws][" + this._wsUri + "] Send (raw):", message);
			}
			this._channelSend({
				channel: channel || 0,
				body: BODEC.fromUnicode(message)
			});
		} catch(err) {
			this.error("[ws][" + this._wsUri + "] Error sending websocket message:", err.stack);
			throw err;
		}
	}

	WS.prototype.close = function () {
		try {
			this._socket.close();
		} catch(err) {
			this.error("[ws][" + this._wsUri + "] Error closing websocket:", err.stack);
			throw err;
		}
	}

	WS.prototype.opCall = function (action, handler, method, extra) {
		if (action === "request") {
			return this.makeRequestTo(handler, method, extra);
		}
		throw new Error("Action of type '" + action + "' not yet supported!");
	}

	WS.prototype.makeRequestTo = function (handler, method, extra) {
		var self = this;
	  	try {
			var id = RANDOM(32);
	  		var payload = {
				"request": {
					"$domain": self._options.domain,
					"$appid": self._options.appid,
					"$id": id,
					"$handler": handler,
					"$method": method
				}
	  		};
	  		if (extra) {
		  		for (var key in extra) {
		  			payload.request[key] = extra[key];
		  		}
	  		}

            return layer._apiexplorer_context.request({
                uri: self._wsUri,
                data: payload.request
            }).then(function(requestId) {

		  		var deferred = Q.defer();

		  		var responseTimeout = null;
		  		self.once("result:" + id, function(result) {
		  			try {
		  				// Got response after 
		  				if (!responseTimeout) {
		  					self.warn("[ws][" + self._wsUri + "] Got response after timeout!");
		  					return;
		  				}
		  				clearTimeout(responseTimeout);
		  				responseTimeout = null;
						if (self._options._debug) {
							self.log("[ws][" + self._wsUri + "] Received [" + id + "]:", result);
						}
						if (result.error) {
							var error = new Error("Gor error '" + result.error.reason["#text"] + "' (code: " + result.error.reason["$id"] + ") while calling '" + self._wsUri + "' (handler: " + handler + ", method: " + method + ")");
							self.error(error.stack);
							return deferred.reject(error);
						}
						return deferred.resolve(result);
		  			} catch(err) {
		  				return deferred.reject(err);
		  			}
		  		});
				if (self._options._debug) {
					self.log("[ws][" + self._wsUri + "] Send (object) [" + id + "]:", payload);
				}
				payload = JSON.stringify(payload);
				if (self._options._debug) {
					self.log("[ws][" + self._wsUri + "] Send (json) [" + id + "]:", payload);
				}
		  		self.send(payload);
		  		responseTimeout = setTimeout(function() {
		  			responseTimeout = null;
		  			// TODO: Remove `self.once("result:" + id)` listener.
		  			return deferred.reject(new Error("[ws][" + self._wsUri + "] Request timed out"));
		  		}, 5 * 1000);
				return Q.when(deferred.promise, function (result) {
                    return layer._apiexplorer_context.response(requestId, {
                        data: result
                    }).then(function() {
                        return result;
                    });
                }, function (err) {
                    return layer._apiexplorer_context.response(requestId, {
                        error: err.code || "ERROR",
                        data: err.stack
                    }).then(function() {
                        throw err;
                    });
                });
            });
	  	} catch(err) {
	  		return Q.reject(err);
	  	}
	}

	WS.prototype.sendNotifyToChannel = function(channel, handler, method, extra) {
		var self = this;
	  	try {

			var id = RANDOM(32);
	  		var payload = {
				"notify": {
					"$domain": self._options.domain,
					"$appid": self._options.appid,
					"$id": id,
					"$handler": handler,
					"$method": method,
					"$timestamp": Math.floor(Date.now()/1000)
				}
	  		};
	  		if (extra) {
		  		for (var key in extra) {
		  			payload.notify[key] = extra[key];
		  		}
	  		}

            return layer._apiexplorer_context.request({
                uri: self._wsUri,
                data: payload.notify
            }).then(function(requestId) {

				if (self._options._debug) {
					self.log("[ws][" + self._wsUri + "] Send (object) [" + request.$id + "]:", payload);
				}
				var payloadString = JSON.stringify(payload);
				if (self._options._debug) {
					self.log("[ws][" + self._wsUri + "] Send (json) [" + request.$id + "]:", payloadString);
				}
		  		self.send(payloadString, channel);

				return layer._apiexplorer_context.response(requestId, {
                    data: ""
                });
			});
	  	} catch(err) {
	  		return Q.reject(err);
	  	}
	}

	exports.connectTo = function(wsUri, options, waitForReady) {
		var deferred = Q.defer();
		var ws = new WS(wsUri, options);
		ws.once("error", function(err) {
			if (!Q.isPending(deferred.promise)) return;
			return deferred.reject(err);
		});
		ws.once("close", function(err) {
			if (!Q.isPending(deferred.promise)) return;
			return deferred.reject(new Error("Could not open socket."));
		});
		ws.on("open", function() {
			if (waitForReady) {
				return ws.once("message-raw", function(message) {
					try {
						return deferred.resolve(ws);
					} catch(err) {
						return deferred.reject(err);
					}
				});
		    } else {
				return deferred.resolve(ws);
		    }
		});
		return deferred.promise;
	}

	return exports;
}


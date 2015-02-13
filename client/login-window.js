
const Q = require("./q");
const JQUERY = require("jquery");
const URI = require("./uri");
const EVENTS = require("./events");
const RANDOM = require("./random");
const LOGGER = require("./logger");


var loginWindow = null;

exports.forLayer = function (layer) {

    var exports = {};

    var LoginWindow = function () {
        this.__no_serialize = true;
        LOGGER.injectLogger(this, "LoginWindow");
        this._win = null;
        this._windowName = "loginwindow-" + layer._client._config._id;
    }
    LoginWindow.prototype = Object.create(EVENTS.prototype);

    LoginWindow.prototype.open = function (url) {
        var self = this;
        return Q.fcall(function () {

            if (self._win) {
                throw new Error("Window already opened. If closed the window instance should have been destroyed as well.");
            }

            var deferred = Q.defer();

            url = URI(url).addSearch("t", Date.now()).toString();

            self._windowListener = function (event) {
                if (event.source !== self._win) return;
                // This event is triggered when the outer frame is loaded instead of
                // the inner frame directly.
                if (event.data === "page.ready:" + self._windowName) {
                    return deferred.resolve();
                }
                try {
                    var data = event.data;

                    if (typeof data === "string") {
                        if (!/^\{/.test(event.data)) return;
                        data = JSON.parse(event.data);
                    }

                    //self.log("Received", event.data);

                    // We don't want to resolve our `open()` promise
                    // until we know the loaded JS is ready. This is the first
                    // event we get when loading the inner frame directly and
                    // the first measure we can use to ensure things are loaded.
                    if (
                        data.request &&
                        data.request.$handler === "identity" &&
                        data.request.$method === "identity-access-window"
                    ) {
                        deferred.resolve(self);
                        return setTimeout(function () {
                            return self.emit("message", data, event);
                        }, 0);
                    }

                    self.emit("message", data, event);

                    if (
                        data.result &&
                        data.result.$id
                    ) {
                        self.emit("result:" + data.result.$id, data.result);
                    }

                } catch (err) {
                    self.error("Error delivering message", err.stack);
                }
            };
            window.addEventListener("message", self._windowListener, false);

            self._pageDestroyListener = function () {
                self.destroy();
            }
            window.addEventListener("unload", self._pageDestroyListener, false);

            self._win = window.open(URI(url).addSearch("reinit", "false").toString(), self._windowName, [
                "width=500",
                "height=500",
                "menubar=no",
                "toolbar=no",
                "personalbar=no",
                "location=yes",
                "resizable=yes",
                "scrollbars=yes",
                "status=yes"
            ].join(","));

            if (!self._win) {
                self.error("We were unable to open a login window! Please check your pop-up blocker options.");
                alert("We were unable to open a login window! Please check your pop-up blocker options.");
                throw new Error("We were unable to open a login window! Please check your pop-up blocker options.");
            }

            var isClosedInterval = setInterval(function () {
                if (!self._win || self._win.closed) {
                    clearInterval(isClosedInterval);
                    self.destroy();
                }
            }, 500);

            self._win.focus();

            return deferred.promise;
        });
    }

    LoginWindow.prototype.opCall = function (action, handler, method, extra) {
        var self = this;
        if (action === "request") {
            return self.makeRequestTo(handler, method, extra);
        }
        return Q.fcall(function () {
            extra = extra || {};
            var id = extra.id || RANDOM(32);
            var payload = {};
            payload[action] = {
                "$domain": layer.get("discover.identityProviderDomain") || "",
                "$appid": layer.get("discover.runtimeApplicationID") || "",
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
//                if (self._options._debug) {
            self.log("Send:", JSON.stringify(payload, null, 4));
//                }
            return self._win.postMessage(payload, "*");
        }).fail(function (err) {
            self.error("Error sending message", err.stack);
            throw err;
        });
    }

    LoginWindow.prototype.makeRequestTo = function (handler, method, extra) {
        var self = this;
        try {
            var id = RANDOM(32);
            var payload = {
                "request": {
                    "$domain": layer.get("discover.identityProviderDomain") || "",
                    "$appid": layer.get("discover.runtimeApplicationID") || "",
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

            return layer._apiexplorer_context.request({
                uri: self._windowName,
                data: payload.request
            }).then(function(requestId) {

                var deferred = Q.defer();

                var responseTimeout = null;
                self.once("result:" + id, function(result) {
                    try {
                        // Got response after 
                        if (!responseTimeout) {
                            self.warn("[ws][" + self._windowName + "] Got response after timeout!");
                            return;
                        }
                        clearTimeout(responseTimeout);
                        responseTimeout = null;
//                        if (self._options._debug) {
//                            self.log("[ws][" + self._windowName + "] Received [" + id + "]:", result);
//                        }
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

                self.log("Send:", JSON.stringify(payload, null, 4));

                self._win.postMessage(payload, "*");

                responseTimeout = setTimeout(function() {
                    responseTimeout = null;
                    // TODO: Remove `self.once("result:" + id)` listener.
                    return deferred.reject(new Error("[ws][" + self._windowName + "] Request timed out"));
                }, 15 * 1000);
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

    LoginWindow.prototype.isOpen = function () {
        return (this._win && !this._win.closed);
    }

    LoginWindow.prototype.destroy = function () {
        if (!this._win) return;
        this.emit("destroy");
        window.removeEventListener("message", this._windowListener, false);
        window.removeEventListener("unload", this._pageDestroyListener, false);
        if (!this._win || this._win.closed) {
            // Not open or already closed.
            return;
        }
        this._win.close();
        this._win = null;
        return;
    }


    exports.getInstance = function () {
        if (loginWindow) {
            if (loginWindow.isOpen()) {
                loginWindow.destroy();
            }
        }
        loginWindow = new LoginWindow();
        return loginWindow;
    }

    return exports;
}


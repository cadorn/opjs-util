
const Q = require("./q");
// TODO: Use Zepto?
const JQUERY = require("jquery");
const URI = require("./uri");
const EVENTS = require("./events");
const RANDOM = require("./random");
const LOGGER = require("./logger");


var loginFrame = null;

exports.forLayer = function (layer) {

    var exports = {};

    var LoginFrame = function (domId, containerDomId) {
        this.__no_serialize = true;
        LOGGER.injectLogger(this, "LoginFrame");
        this._domId = domId;
        this._containerDomId = containerDomId;
    }
    LoginFrame.prototype = Object.create(EVENTS.prototype);
    /*
    LoginFrame.prototype.ensure = function (url) {
        if (this.isLoaded()) {
            this.reload(url);
        } else {
            this.generate(url);
        }
    }
    */
    LoginFrame.prototype.isLoaded = function () {
        return (JQUERY("IFRAME#" + this._domId).length === 1);
    }
    /*
    LoginFrame.prototype.reload = function (url) {
        url = URI(url)
            .addSearch("reload", "true")
            .addSearch("t", Date.now()).toString();
        $("IFRAME#" + this._domId).attr("src", url);
    }
    */
    LoginFrame.prototype.create = function (url) {
        var self = this;
        return Q.fcall(function () {
//        return Q.timeout(Q.fcall(function () {

            var deferred = Q.defer();

            url = URI(url).addSearch("t", Date.now()).toString();

            self._windowListener = function (event) {

                if (event.source !== $("IFRAME#" + self._domId)[0].contentWindow) return;

                // This event is triggered when the outer frame is loaded instead of
                // the inner frame directly.
                if (event.data === "page.ready:unnamed") {
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

            JQUERY("IFRAME#" + self._domId).remove();
            JQUERY('<iframe id="' + self._domId + '" style="display: none; width: 100%; height: 100%; position: absolute; top: 0; left: 0;" src="' + url + '"></iframe>').appendTo("#"+self._containerDomId);

            return deferred.promise;
        });
//        }), 5 * 1000);
    }

    LoginFrame.prototype.opCall = function (action, handler, method, extra) {
        var self = this;
        if (action === "request") {
            return self.makeRequestTo(handler, method, extra);
        }
        return Q.fcall(function () {
            extra = extra || {};
            var iframe = $("IFRAME#" + self._domId);
            if (iframe.length === 0) {
                throw new Error("Cannot send message to outer frame. No frame loaded!");
            }
            var url = iframe.attr("src");

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
            self.log("[request] Send (object):", JSON.stringify(payload, null, 4));
//            return iframe[0].contentWindow.postMessage(payload, '*');
            return iframe[0].contentWindow.postMessage(payload, url.replace(/$(https?:\/\/[^\/]+)/, "$1"));
        }).fail(function (err) {
            self.error("Error sending message", err.stack);
            throw err;
        });
    }

    LoginFrame.prototype.makeRequestTo = function (handler, method, extra) {
        var self = this;
        try {
            var iframe = $("IFRAME#" + self._domId);
            if (iframe.length === 0) {
                throw new Error("Cannot send message to outer frame. No frame loaded!");
            }
            var url = iframe.attr("src");

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
//                if (self._options._debug) {
//                    self.log("[ws][" + self._windowName + "] Send (object) [" + id + "]:", payload);
//                }
//                payload = JSON.stringify(payload);
//                if (self._options._debug) {
//                    self.log("[ws][" + self._windowName + "] Send (json) [" + id + "]:", payload);
//                }
                iframe[0].contentWindow.postMessage(payload, url.replace(/$(https?:\/\/[^\/]+)/, "$1"));
//                iframe[0].contentWindow.postMessage(payload, "*");
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

    LoginFrame.prototype.show = function () {
        JQUERY("IFRAME#" + this._domId).show();
    }

    LoginFrame.prototype.hide = function () {
        JQUERY("IFRAME#" + this._domId).hide();
    }

    LoginFrame.prototype.destroy = function () {
        this.hide();
        this.emit("destroy");
        JQUERY("IFRAME#" + this._domId).remove();
        if (this._windowListener) {
            window.removeEventListener("message", this._windowListener, false);
            this._windowListener = null;
        }
    }


    exports.getInstance = function () {
        if (loginFrame) {
            if (loginFrame.isLoaded()) {
                loginFrame.destroy();
            }
        }
        loginFrame = new LoginFrame(
            "login-frame-" + layer._client._config._id,
            "client-" + layer._client._config._id
        );
        return loginFrame;
    }

    return exports;
}


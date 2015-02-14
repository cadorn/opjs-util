
const Q = require("./q");


var FETCH = null;
exports.setAPI_FETCH = function (impl) {
  FETCH = impl;
}

var RANDOM = null;
exports.setAPI_RANDOM = function (impl) {
  RANDOM = impl;
}


exports.forContext = function (context) {

    context = context || {};

    return {
        call: function (service, identity, handler, method, extra, options) {

            try {
                var id = RANDOM(32);
                var payload = {
                    "request": {
                        "$domain": identity.domain || null,
                        "$appid": identity.appid || "com.hookflash.testapp-<expiry>-<token>-<hash>",
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
//                if (self._options._debug) {
//                    console.log("[request] Send (object):", JSON.stringify(payload, null, 4));
//                }
                var payloadString = JSON.stringify(payload);
                if (options.debug) {
                    console.log("[request] Send (json):", JSON.stringify(payload, null, 4));
                }

            } catch (err) {
                return Q.reject(err);
            }


            function makeRequest () {
                return FETCH.postJSON(service.uri, payloadString).then(function(response) {

                    if (
                        !response ||
                        !response.result
                    ) {
                        throw new Error("Response does not include a 'result' object!");
                    }

                    if (options.debug) {
                        console.log("[request] Received:", JSON.stringify(response.result, null, 4));
                    }

                    if (
                        response.result.$id !== id &&
                        (!options.validate || (options.validate.responseId !== false))
                    ) {
                        throw new Error("$id in response '" + response.result.$id + "' does not match $id in request '" + id + "'!");
                    }

                    return response.result;
                });
            }


            var apiExplorerContext = (context.getApiExplorerContext && context.getApiExplorerContext()) || null;

            if (!apiExplorerContext) {
                return makeRequest();
            }

            return apiExplorerContext.request({
                uri: service.uri,
                data: payload.request
            }).then(function(requestId) {
                return makeRequest().then(function (result) {
                    if (result.error && result.error.$id !== 302) {
                        return apiExplorerContext.response(requestId, {
                            error: result.error.$id || "ERROR",
                            data: result
                        }).then(function() {
                            return result;
                        });
                    }
                    return apiExplorerContext.response(requestId, {
                        data: result
                    }).then(function() {
                        return result;
                    });
                }, function (err) {
                    return apiExplorerContext.response(requestId, {
                        error: err.code || "ERROR",
                        data: err.stack
                    }).then(function() {
                        throw err;
                    });
                });
            });
        }
    };
}

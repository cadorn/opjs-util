
const Q = require("./q");
const RANDOM = require("./random");
const FETCH = require("./fetch");
const CRYPTO = require("./crypto");

//console.log("CRYPTO", CRYPTO);


exports.forLayer = function (layer) {

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

            return layer._apiexplorer_context.request({
                uri: service.uri,
                data: payload.request
            }).then(function(requestId) {

                var deferred = Q.defer();

                FETCH(service.uri, {
                    method: "post",
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: payloadString
                }).then(function(response) {

                    if (response.status !== 200) {
                        var err = new Error("Got status " + response.status);
                        err.code = response.status;
                        throw err;
                    }
//                    console.log('response', response)               
                    return response.json()
                }).then(function(response) {

                    try {
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

                        return deferred.resolve(response.result);
                    } catch (err) {
                        return deferred.reject(err);
                    }

                }).catch(function(err) {

                    // TODO: Add context info.
                    return deferred.reject(err);
                });

                return Q.when(deferred.promise, function (result) {
                    if (result.error && result.error.$id !== 302) {
                        return layer._apiexplorer_context.response(requestId, {
                            error: result.error.$id || "ERROR",
                            data: result
                        }).then(function() {
                            return result;
                        });
                    }
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
        }
    };
}

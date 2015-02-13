

const CRYPTO = require("common/crypto");

CRYPTO.setAPI_RANDOM(require("./random"));

for (var name in CRYPTO) {
  exports[name] = CRYPTO[name];
}

const Q = require("./q");
const WORKER = require("./worker");



exports.generateKeyPair = function (size) {
    var deferred = Q.defer();

    var worker = WORKER.single(require.sandbox.id + require.id("./crypto-worker.js"));
    worker.on("message", function (message) {
        if (message.method === "generateKeyPair_worker") {
            return deferred.resolve({
                privateKey: PKI.privateKeyFromPem(message.response.privatePem),
                publicKey: PKI.publicKeyFromPem(message.response.publicPem)
            });
        }
    });
    worker.run().then(function () {
        worker.send({
            method: "generateKeyPair_worker",
            args: [
                size
            ]
        });
    });
    return Q.when(deferred.promise).fin(function () {
        worker.destroy();
    });
}

exports.generateKeyPair_worker = function (size) {
  	var pair = CRYPTO.generateKeyPair(size);
  	return {
        privatePem: FORGE.pki.privateKeyToPem(pair.privateKey),
        publicPem: FORGE.pki.publicKeyToPem(pair.publicKey)
    };
}


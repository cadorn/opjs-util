
const CRYPTO = require("common/crypto");

CRYPTO.setAPI_RANDOM(require("./random"));

for (var name in CRYPTO) {
	exports[name] = CRYPTO[name];
}

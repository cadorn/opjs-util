
const CRYPTO = require("crypto");

var formats = {
	hex: function (length) {
		return CRYPTO.randomBytes(length).toString('hex');
	},
	base64: function (length, maxline) {
		// TODO: Respect `maxline`
		return CRYPTO.randomBytes(length).toString('base64');
	}
};

module.exports = formats.hex;
for (var format in formats) {
	module.exports[format] = formats[format];
}

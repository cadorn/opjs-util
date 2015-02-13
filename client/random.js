
const FORGE = require("node-forge/js/forge")();


var formats = {
	hex: function (length) {
		return FORGE.util.bytesToHex(FORGE.random.getBytesSync(length));
	},
	base64: function (length, maxline) {
		return FORGE.util.encode64(FORGE.random.getBytesSync(length), maxline);
	}
};

module.exports = formats.hex;
for (var format in formats) {
	module.exports[format] = formats[format];
}

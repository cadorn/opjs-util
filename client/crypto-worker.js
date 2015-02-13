
const CRYPTO = require("./crypto");


exports.main = function () {

	function send (message) {
		self.postMessage(JSON.stringify(message));
	}

	self.addEventListener("message", function (event) {
		var m = null;
		if (typeof event.data !== "string") return;
		if (!/^\{/.test(event.data)) return;
		try {
			var message = JSON.parse(event.data);
			onMessage(message);
		} catch (err) {
			console.error("Error parsing message data", err.stack, event.data);				
		}
	});

	function onMessage (message) {
		return send({
			"method": message.method,
			"response": CRYPTO[message.method].apply(null, message.args)
		});
	}

	return send("ready");
}

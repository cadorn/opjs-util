
const Q = require("./q");
const EVENTS = require("./events");
const URIJS = require("./uri");



var SingleWorker = function (uri) {
	var self = this;
    
    self._uri = uri;
    self._worker = null;

	try {

		self._worker = new window.Worker("/lib/pinf-loader-js/loader.js");

		self._worker.onerror = function (err) {
			console.error("Worker error:", err.stack);
			throw err;
		};

		self._worker.onmessage = function (event) {
			var m = null;
			if (typeof event.data !== "string") return;
			if (
				(m = event.data.match(/^notify:\/\/pinf-loader-js\/sandbox\/loaded\?uri=(.+)$/)) &&
				(m = decodeURIComponent(m[1])) &&
				m === self._uri
			) {
				return self.emit("ready");
			}
			if (!/^\{/.test(event.data)) return;
			try {
				var message = JSON.parse(event.data);
				self.emit("message", message);
			} catch (err) {
				console.error("Error parsing message data", err.stack, event.data);				
			}
		};

	} catch (err) {
		console.error("Error loading worker harness '" + "/lib/pinf-loader-js/loader.js" + "':", err.stack);
		deferred.reject(err.stack);
	}
}
SingleWorker.prototype = Object.create(EVENTS.prototype);

SingleWorker.prototype.send = function (message) {
	this._worker.postMessage(JSON.stringify(message));
}

SingleWorker.prototype.run = function () {
    var self = this;

	var deferred = Q.defer();

	try {

		self.on("ready", function () {
			return deferred.resolve(self);
		});

		self._worker.postMessage(
			URIJS("notify://pinf-loader-js/sandbox/load")
				.addSearch("uri", self._uri)
				.toString()
		);

	} catch (err) {
		console.error("Error loading worker '" + self._uri + "':", err.stack);
		deferred.reject(err.stack);
	}
	return deferred.promise;
}

SingleWorker.prototype.destroy = function () {
	this._worker.terminate();
}


exports.single = function (uri) {
	return new SingleWorker(uri);
}

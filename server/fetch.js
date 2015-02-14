
const Q = require("./q");
const REQUEST = require("request");


module.exports = REQUEST;

module.exports.fetchJSON = function (uri) {
	var options = {
		method: "GET",
		url: uri
	};
	return Q.denodeify(REQUEST)(options).then(function (args) {
		var response = args[0];
		var body = args[1];
		if (response.statusCode !== 200 && !body.error) {
			throw new Error("Got response status '" + response.statusCode + "' and body: " + JSON.stringify(body));
		}
		return JSON.parse(body);
	}).fail(function(err) {
		err.message += " (while calling '" + JSON.stringify(options) + "')";
		err.stack += "\n(while calling '" + JSON.stringify(options) + "')";
		throw err;
	});
}

module.exports.postJSON = function (uri, payloadString) {
	var options = {
		method: "POST",
		url: uri,
		json: JSON.parse(payloadString),
		contentType: "application/json"
	};
	return Q.denodeify(REQUEST)(options).then(function (args) {
		var response = args[0];
		var body = args[1];
		if (response.statusCode !== 200 && !body.error) {
			throw new Error("Got response status '" + response.statusCode + "' and body: " + JSON.stringify(body));
		}
		return body;
	}).fail(function(err) {
		err.message += " (while calling '" + JSON.stringify(options) + "')";
		err.stack += "\n(while calling '" + JSON.stringify(options) + "')";
		throw err;
	});
}

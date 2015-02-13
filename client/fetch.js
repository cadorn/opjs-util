
const Q = require("./q");
const FETCH = require("whatwg-fetch").self.fetch;


module.exports = FETCH;

module.exports.fetchJSON = function (uri) {
	var deferred = Q.defer();
	FETCH(uri, {
	    headers: {
	        'Accept': 'application/json',
	        'Content-Type': 'application/json'
	    }
	}).then(function(response) {
	    if (response.status !== 200) {
	        var err = new Error("Got status " + response.status);
	        err.code = response.status;
	        throw err;
	    }
	    return response.json();
	}).then(function(response) {
		return deferred.resolve(response);
	}).catch(function(err) {
	    return deferred.reject(err);
	});
	return deferred.promise;
}

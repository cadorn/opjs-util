
const Q = require("./q");
const $ = require("./jquery");
const RANDOM = require("./random");


exports.loadRemote = function (config) {

    return Q.denodeify(function (callback) {

        $('<script type="text/javascript" src="//' + config.host + config.api.logger + '"></script>').appendTo("BODY");

        var testInterval = setInterval(function () {
            if (!window.__LOGGER) return;                   
            clearInterval(testInterval);
            testInterval = null;
            return callback(null);
        }, 250);
        return setTimeout(function () {
            if (!testInterval) return;
            clearInterval(testInterval);
            testInterval = null;
            return callback(new Error("Error loading logger! `window.__LOGGER` not available after 5 seconds."));
        }, 5 * 1000);
    })().then(function () {

        window.__LOGGER.setUrl('//' + config.host + config.api.record);
        window.__LOGGER.setChannel("identity-hcs-api-logger");

        return window.__LOGGER;
    });
}



// TODO: Remove this once we use insight to log messages.
var logInstance = RANDOM(32).substring(0, 2);
var logIndex = 0;
var CONSOLE = console;

exports.injectLogger = function(obj, logPrefix) {

    function getLoggers () {
        var loggers = [];
        if (CONSOLE) {
            loggers.push(CONSOLE);
        }
        if (window.__LOGGER) {
            loggers.push(window.__LOGGER);
        }
        return loggers;
    }

    // TODO: Remove this once we use insight API.
    function wrapConsoleArgs(args) {
        logIndex += 1;
        return [
            "i:" + logInstance + ":" + logIndex,
            "(" + (obj._logPrefix || logPrefix) + ")> "
        ].concat(args);
    }

    // NOTE: I know this is ugly but we cannot call `console[severity].apply()` for some reason.
    var logger = {};
    ([
        "log",
        "info",
        "warn",
        "error"
    ]).forEach(function(severity) {
        logger[severity] = function() {
//              if (severity !== "error" && !self._verbose) return;
            var args = wrapConsoleArgs(Array.prototype.slice.call(arguments));

            getLoggers().forEach(function (console) {
                try {
                    if (console[severity]) {
                        args = [severity].concat(args);
                        severity = "log";
                    }

                    // Cannot call `apply()` or `call()` on console methods so we have to do it the hard way.
                    if (args.length === 1) {
                        console[severity](args[0]);
                    } else
                    if (args.length === 2) {
                        console[severity](args[0], args[1]);
                    } else
                    if (args.length === 3) {
                        console[severity](args[0], args[1], args[2]);
                    } else
                    if (args.length === 4) {
                        console[severity](args[0], args[1], args[2], args[3]);
                    } else
                    if (args.length === 5) {
                        console[severity](args[0], args[1], args[2], args[3], args[4]);
                    } else
                    if (args.length === 6) {
                        console[severity](args[0], args[1], args[2], args[3], args[4], args[5]);
                    } else
                    if (args.length === 7) {
                        console[severity](args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
                    } else {
                        throw new Error("Too many arguments: " + args.length);
                    }
                } catch(err) {
                    if (CONSOLE) {
                        CONSOLE.error(err.stack);
                    }
                }
            });
        }
    });

    for (var name in logger) {
        if (typeof obj[name] !== "undefined") {
            throw new Error("Logger method '" + name + "' already defined on object");
        }
        obj[name] = logger[name];
    }
}

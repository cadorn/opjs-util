module.exports = function typeCheck(value, type) {
  check(value, type, "");
  function check(value, type, path) {
    if (value === undefined) {
      throw new Error("Missing required property " + path);
    }
    if (Array.isArray(type)) {
      if (!Array.isArray(value)) {
        throw new TypeError(path + " should be Array not " + value.constructor.name);
      }
      for (var i = 0, l = type.length; i < l; i++) {
        check(value[i], type[i], path + "[" + i + "]");
      }
    }
    else if (typeof type === "object") {
      if (typeof value !== "object") {
        throw new TypeError(path + " should be Object not " + value.constructor.name);
      }
      for (var name in type) {
        check(value[name], type[name], (path ? path + "." : "") + name);
      }
    }
    else if (typeof type === "function") {
      if (value === null) {
        throw new TypeError(path + " should be " + type.name + " not null");
      }
      if (value.constructor !== type) {
        throw new TypeError(path + " should be " + type.name + " not " + value.constructor.name);
      }
    }
    else {
      if (value !== type) {
        throw new TypeError(path + " should equal " + JSON.stringify(type) + " not " + JSON.stringify(value));
      }
    }
  }
};

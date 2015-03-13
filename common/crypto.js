
const Q = require("q");
const PKI = require("node-forge/js/pki")();
const SHA1 = require("node-forge/js/sha1")();
const SHA256 = require("node-forge/js/sha256")();
const RSA = require("node-forge/js/rsa")();
const ASN1 = require("node-forge/js/asn1")();
const UTIL = require("node-forge/js/util")();
const FORGE = require("node-forge/js/forge")();

var RANDOM = null;
exports.setAPI_RANDOM = function (impl) {
  RANDOM = impl;
}


exports.SHA1 = function (input) {
	if (!UTIL.isArrayBuffer(input)) {
		input = UTIL.hexToBytes(input);
	}
	var hash = SHA1.create();
    hash.start();
    hash.update(input);
    return hash.digest();
}


var HMAC256 = exports.HMAC256 = function (secret, string) {
  var hmac = FORGE.hmac.create();
  hmac.start('sha256', secret);
  hmac.update(string);
  return hmac.digest();
}

exports.privateKeyToPem = PKI.privateKeyToPem;
exports.publicKeyToPem = PKI.publicKeyToPem;

exports.privateKeyFromPem = PKI.privateKeyFromPem;
exports.publicKeyFromPem = PKI.publicKeyFromPem;

exports.privateKeyFromDer = function (der) {
  return FORGE.pki.privateKeyFromAsn1(ASN1.fromDer(FORGE.util.decode64(der)));
}

exports.publicKeyFromPrivateDer = function (der) {
  var privateKey = exports.privateKeyFromDer(der);
  var publicKey = PKI.rsa.setPublicKey(privateKey.n, privateKey.e);
  return {
    base64: function () {
      return FORGE.util.encode64(ASN1.toDer(PKI.publicKeyToAsn1(publicKey)).getBytes());
    }
  }
}

exports.generateKeyPair = function (size) {
  	var pair = FORGE.pki.rsa.generateKeyPair(size, 0x10001);
    return {
        privateKey: pair.privateKey, 
        publicKey: pair.publicKey
    };
}


/**
 * OpenPeer bundle helper.  Takes a JSON object and signs it returning a JSON bundle
 *
 * @param name the JSON key to use for the original message.
 * @param message the message to sign.
 * @param key the RSA key to use to sign.
 * @param keyData extra data to put in the signature object.
 *
 * @return a new JSON object representing the signed bundle.
 *
 * @see http://docs.openpeer.org/OpenPeerProtocolSpecification/#GeneralRequestReplyNotifyAndResultFormationRules
 */
/*
exports.signBundleForKeys = function (name, message, privateKey, publicKey) {
	return signBundle(name, message, privateKey, {
		x509Data: FORGE.util.encode64(ASN1.toDer(PKI.publicKeyToAsn1(publicKey)).getBytes())
  });
}
*/
var signBundle = exports.signBundle = function signBundle (name, message, key, keyData) {
  // Insert $id if none is found
  if (!message.$id) {
    message = merge({
    	$id: RANDOM(32)
   	}, message);
  }
  var id = message.$id;

  // Sort the keys while encoding as json.
  var json = normalizeObject(message);
  // And digest the message using sha1
  var md = SHA1.create();
  md.start();
  md.update(json);

  var bundle = {};
  bundle[name] = message;
  bundle.signature = {
    reference: '#' + id,
    algorithm: 'http://openpeer.org/2012/12/14/jsonsig#rsa-sha1',
    digestValue: FORGE.util.encode64(md.digest().getBytes()),
    digestSigned: FORGE.util.encode64(key.sign(md)),
    key: keyData
  };

  return bundle;
}

/**
 * @param args is an object hash of the named arguments.
 *
 *   "privateKey" - RSA private key used to sign bundles
 *   "publicKey" - RSA public key stored in section A's signature
 *   "domain" - domain to use in contactURI
 *   "lifetime" - the number of seconds till this new file expires
 *   "saltBundle" - the actual saltBundle
 *   "findSecret" - Optional parameter that creates a section B
 *   "identityBundle" - Optional list of identity bundles
 *
 * @see http://docs.openpeer.org/OpenPeerProtocolSpecification/#TheMakeupOfThePublicPeerFile
 */
exports.generatePublicPeerFile = function (args) {
  if (!args.privateKey) throw new Error("privateKey is required");
  if (!args.publicKey) throw new Error("publicKey is required");
  if (!args.domain) throw new Error("domain is required");
  if (!args.lifetime) throw new Error("lifetime is required");
  if (!args.saltBundle) throw new Error("saltBundle is required");
  
  var now = Math.floor(Date.now() / 1000);
  var A = {
    $id: 'A',
    cipher: 'sha256/aes256',
    created: now,
    expires: now + args.lifetime,
    saltBundle: args.saltBundle
  };
  var sectionBundle = [signBundle('section', A, args.privateKey, {
    x509Data: FORGE.util.encode64(ASN1.toDer(PKI.publicKeyToAsn1(args.publicKey)).getBytes())
  })];

  var contact = getContactUri(A, args.domain);
  
  if (args.findSecret) {
    sectionBundle.push(signBundle('section', {
      $id: 'B',
      contact: contact,
      findSecret: args.findSecret
    }, args.privateKey, {
      uri: contact
    }));
  }

  // TODO: Only include section C if `args.identityBundle` is provided.
  var C = {
    $id: 'C',
    contact: contact
  };
  if (args.identityBundle) {
    C.identities = {
      identityBundle: args.identityBundle
    };
  }
  sectionBundle.push(signBundle('section', C, args.privateKey, {
    uri: contact
  }));

  // Store the contact uri in the result, but hidden behind a prototype.
  var hidden = {
    contact: contact
  };
  var result = Object.create(hidden);
  result.peer = {
    $version: "1",
    sectionBundle: sectionBundle
  }
  return result;
}



/**
 * @param args is an object hash of the named arguments.
 *   "contact" the contact URI
 *   "salt" a random salt
 *   "secret" a secret string used to encrypt the data and verify access
 *   "privateKey" the RSA private key
 *   "publicPeerFile" the public peer file
 *   "data" Optional extra data
 *
 * @see http://docs.openpeer.org/OpenPeerProtocolSpecification/#TheMakeupOfThePrivatePeerFile
 */
exports.generatePrivatePeerFile = function (args) {
  if (!args.contact) throw new Error("contact is required");
  if (!args.salt) throw new Error("salt is required");
  if (!args.secret) throw new Error("secret is required");
  if (!args.privateKey) throw new Error("privateKey is required");
  if (!args.publicPeerFile) throw new Error("publicPeerFile is required");
  
  var sectionBundle = [signBundle('section', {
    $id: 'A',
    contact: args.contact,
    cipher: 'sha256/aes256',
    salt: args.salt,
    secretProof: HMAC256(args.secret, 'proof:' + args.contact).toHex()
  }, args.privateKey, {
    uri: args.contact
  })];

  var pkcs = ASN1.toDer(PKI.privateKeyToAsn1(args.privateKey)).getBytes()
  var B = {
    $id: 'B',
    encryptedContact: encrypt('contact:', args.contact),
    encryptedPrivateKey: encrypt('privatekey:', pkcs),
    encryptedPeer: encrypt('peer:', JSON.stringify(args.publicPeerFile)),
  }
  if (args.data) {
    B.encryptedPrivateData = encrypt('data:', args.data);
  }
  sectionBundle.push(signBundle('section', B, args.privateKey, {
    uri: args.contact
  }));

  function encrypt(prefix, data) {
    var key = HMAC256(args.secret, prefix + args.salt).bytes();
    var iv = IV(prefix + args.salt).getBytes();
	var cipher = FORGE.cipher.createCipher('AES-CFB', key);
	cipher.start({iv: iv});
	cipher.update(FORGE.util.createBuffer(data));
	cipher.finish();
	return FORGE.util.encode64(cipher.output.bytes());
  }

  return {
    privatePeer: {
      $version: "1",
      sectionBundle: sectionBundle
    }
  };
}


function IV (input) {
	var md = FORGE.md.md5.create();
	md.update(input);
	return md.digest();
}

function getContactUri(A, domain) {
	var md = FORGE.md.sha1.create();
	md.update(normalizeObject(A));
	return 'peer://' + domain + '/' + md.digest().toHex();
}

// Deep sort object by keys alphabeticaly
function normalizeObject(object) {
  if (!object || typeof object !== "object") return object;
  if (Array.isArray(object)) return object.map(normalizeObject);
  var keys = Object.keys(object).sort(customSort);
  var newObject = {};
  keys.forEach(function (key) {
    newObject[key] = normalizeObject(object[key]);
  });
  return newObject;
}

// Sort alphabetically, but in three groups:
// first keys starting with `$`
// then keys starting with `#`
// then other keys
function customSort(a, b) {
  // If they are in different categories, sort by category.
  if (a[0] !== b[0]) {
    // Put $ group first
    if (a[0] === "$") return -1;
    if (b[0] === "$") return 1;
    // Then # group
    if (a[0] === "#") return -1;
    if (b[0] === "#") return 1;
  }
  // Anything else sort normally
  return a > b ? 1 : a < b ? -1 : 0;
}

// Merge object b into object a, returning object a
function merge(a, b) {
  Object.keys(b).forEach(function (key) {
    a[key] = b[key];
  });
  return a;
}


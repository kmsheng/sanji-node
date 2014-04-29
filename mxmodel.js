'use strict';

var crypto = require('crypto'),
    log = require('bunyan').log,
    url = require('url'),
    MxMqtt = require('./mxmqtt'),
    q = require('q'),
    qs = require('qs'),
    util = require('util'),
    MxUtils = require('./mxutils');

/**
 * Creates an instance of MxModel
 * @constructor
 * @this {MxModel}
 * @param {object} options common settings go here.
 * @example
 * var mxmodel = new MxModel({host: '192.168.27.133'});
 */
function MxModel(options) {

  MxUtils.call(this);

  this.defaultConfig();
  this.mxmqtt = new MxMqtt();

  options = options || {};
  options.host = options.host || 'localhost';
  options.port = options.port || 1883;

  this.setMxMqtt('host', options.host);
  this.setMxMqtt('port', options.port);
}

util.inherits(MxModel, MxUtils);

/**
 * Sets the default configuration of MxModel
 * @private
 */
MxModel.prototype.defaultConfig = function() {

  this.set('description', 'This is a model without description.');
  this.set('hook', []);
  this.set('name', 'NoName_' + crypto.randomBytes(8).toString('hex'));

  // Is registered flag.
  this.disable('registered');

  // Enable auto re-register
  this.enable('reregister');

  this.set('resources', []);

  // Role: model, view
  this.set('role', 'model');
  this.set('topic', '/controller');
  this.set('ttl', 5);
  this.set('tunnel', 'TempTunnel_' + crypto.randomBytes(8).toString('hex'));

  this.routes = [];
};

/**
 * Sets the tunnel of MxModel
 * @return {promise} A promise object of q.
 */
MxModel.prototype.setTunnel = function(newTunnel) {

  var deferred = q.defer(),
      name = this.get('name'),
      tunnel = this.get('tunnel');

  // unsubscribe the old tunnel
  if (null !== tunnel && tunnel !== newTunnel) {

    this.mxmqtt.unsubscribe(tunnel)
      .then(function() {
        log.debug('[%s] Unsubscribe %s', name, tunnel);
      });
  }

  this.set('tunnel', newTunnel);
  this.mxmqtt.subscribe(newTunnel)
    .then(function() {
      log.debug('[%s] Subscribe %s', name, newTunnel);
      deferred.resolve();
    });

  return deferred.promise;
};

/**
 * Deregister a name from MxController
 * @return {promise} A promise object of q.
 */
MxModel.prototype.deregister = function() {

  var deferred = q.defer(),
      name = this.get('name'),
      self = this;

  this.request({
    method: 'delete',
    resource: '/controller/registration/' + name
  })
  .then(function(message) {
      self.set('registered', false);
      deferred.resolve(message);

      log.debug('[%s] De-Register successfully !', name);
  })
  .catch(function(err) {
    deferred.reject(err);
    log.debug('[%s] De-Register error !', name);
  });

  log.debug('[%s] De-Register request is sent', name);

  return deferred.promise;
};

/**
 * Get the registration info from MxModel's settings
 * @return {object} Registration info
 */
MxModel.prototype.getRegistrationInfo = function() {

  var modelInfo = ['name', 'resources', 'role', 'hook', 'description', 'tunnel', 'ttl'],
      properties = {};

  for (var i = modelInfo.length - 1; i >= 0; i--) {
    properties[modelInfo[i]] = this.get(modelInfo[i]);
  }
  return properties;
};

/**
 * Make a sanji framework standard mqtt request with MxModel's current topic
 * @param {string} message The message to be sent
 * @return {promise} Promise object of q
 */
MxModel.prototype.request = function(message) {
  return this.mxmqtt.request(this.get('topic'), message);
};

/**
 * To register MxModel's name from MxController
 * @return {promise} Promise object of q
 */
MxModel.prototype.register = function() {

  var deferred = q.defer(),
      name = this.get('name'),
      self = this,
      tunnel = this.get('tunnel');

  self.deregister();

  self.setTunnel(tunnel)
    .then(function() {

      self.request({
        method: 'post',
        resource: '/controller/registration',
        data: self.getRegistrationInfo()
      })
      .then(function(message) {

        self.setTunnel(message.data.tunnel).then(function() {

          self.enable('registered');

          log.debug('[%s] Register successfully! tunnel: %s', name, message.data.tunnel);
          deferred.resolve(message.data.tunnel);
        });
      }, function(message) {
        deferred.reject(message);
      });

      log.debug('[%s] Register request is sent', name);
    });

  return deferred.promise;
};

/**
 * To publish a message with current topic
 * @param {string} message Message to be sent
 * @return {promise} Promise object of q
 */
MxModel.prototype.publish = function(message) {
  this.mxmqtt.publish(this.get('topic'), message);
};

/**
 * To receive messages by mqtt's on message event
 * and dispatch to each stored callback
 * @param {string} topic Mqtt topic
 * @param {string} message Mqtt message
 */
MxModel.prototype.onMessage = function(topic, message) {

  var routes = this.routes[message.method];

  if (! Array.isArray(routes)) {
    log.info('Did not declare this method.');
    return;
  }

  var buildParams = function(paramNames, paramValues) {

    var params = {},
        index = 0;

    paramNames.forEach(function(paramName) {
      params[paramName] = paramValues[index];
      index++;
    });

    return params;
  };

  for (var i in routes) {

    if (! routes.hasOwnProperty(i)) {
      continue;
    }
    var route = routes[i],
        parts = url.parse(message.resource),
        matches = route.regexp.exec(parts.pathname);

    if (matches) {

      var req = {};
      req.params = {};

      matches.shift(); // pop the global one
      var paramValues = matches;

      log.trace('regexp:', route.regexp);
      log.trace('resource:', message.resource);
      log.trace('matches:', matches);
      log.trace('paramValues', paramValues);

      req.params = buildParams(route.paramNames, paramValues);
      req.query = qs.parse(parts.query);

      if ('function' === typeof route.callback) {
        route.callback(req, message);
        break;
      }
    }
  }
};

/**
 * Start to mqtt instance
 */
MxModel.prototype.listen = function() {
  this.mxmqtt.listen();
  this.mxmqtt.mqtt.on('connect', this.connect.bind(this));
  this.mxmqtt.on('message', this.onMessage.bind(this));
  this.mxmqtt.mqtt.on('close', this.close.bind(this));
};

/**
 * Set a mxmqtt's settings
 * @param {string} setting Property of mxmqtt's setting
 * @param {string} value Value of mxmqtt's setting
 */
MxModel.prototype.setMxMqtt = function(setting, value) {
  return this.mxmqtt.set(setting, value);
};

/**
 * Get a mxmqtt's settings
 * @param {string} setting Property of mxmqtt's setting
 */
MxModel.prototype.getMxMqtt = function(setting) {
  return this.mxmqtt.get(setting);
};

/**
 * Callback bind to mqtt's connect
 */
MxModel.prototype.connect = function() {

  var self = this,
      name = self.get('name');

  log.debug('[%s] MxMQTT is connecting...', name);

  if (self.disabled('registered') && self.enabled('reregister')) {

    log.info('[%s] MxMQTT is connected.', name);
    log.debug('[%s] MxMQTT is registering...', name);

    self.register()
      .then(function() {
        self.enable('registered');
        log.info('[%s] MxMQTT is registered.', name);
        self.emit('registered');
      });
  }
};

/**
 * Parse param names from url
 * @example
 * /student/:student_id/book/:book_id // ['student_id', 'book_id']
 * @return {array}
 */
var parseParam = function(url) {

  var names = [],
      matches = url.match(/:([\w\_\-]+)/g);

  matches = matches ? matches : [];

  matches.forEach(function(name) {
    names.push(name.replace(':', ''));
  });

  return names;
};

/**
 * Turn an url into regexp object
 * @example
 * /student/:student_id/book/:book_id // new RegExp('^\/student\/([\w\-\_]+)\/book\/([\w\-\_]+)$');
 * @return {object} RegExp object
 */
var resourceToRegExp = function(resource) {
  var replacedStr = resource.replace(/:[\w\-]+/g, '([\\w\\-\\_]+)')
                      .replace(/\//g, '\\/');
  return new RegExp('^' + replacedStr + '$');
};

['get', 'post', 'put', 'delete'].forEach(function(method) {

  /**
   * get, post, put, delete listeners of MxModel
   * @example
   * mxmodel.post('/student/:student_id/book/:book_id', function(req, message) {
   *  // do something here
   * });
   */
  MxModel.prototype[method] = function(key, callback) {

    if ((1 === arguments.length) && ('get' === method)) {
      return this.settings[key];
    }

    var resource = key,
        paramNames = parseParam(resource);

    if (! this.routes[method]) {
      this.routes[method] = [];
    }

    this.routes[method].push({
      resource: resource,
      regexp: resourceToRegExp(resource),
      callback: callback,
      paramNames: paramNames
    });

  };
});

/**
 * Callback of mqtt's close event
 */
MxModel.prototype.close = function() {

  var self = this;
  self.disable('registered');
  log.warn('[%s] MxMQTT can\'t connect to %s', self.getMxMqtt('name'), self.getMxMqtt('host') + ':' + self.getMxMqtt('port'));
};

exports = module.exports = MxModel;

'use strict';
/**
 * MxCloud Model
 */

var crypto = require('crypto'),
    log = require('bunyan').log,
    url = require('url'),
    mixin = require('utils-merge'),
    MxMqtt = require('./mxmqtt'),
    q = require('q'),
    qs = require('qs'),
    util = require('util'),
    MxUtils = require('./mxutils');

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

MxModel.prototype.getRegistrationInfo = function() {

  var modelInfo = ['name', 'resources', 'role', 'hook', 'description', 'tunnel', 'ttl'],
      properties = {};

  for (var i = modelInfo.length - 1; i >= 0; i--) {
    properties[modelInfo[i]] = this.get(modelInfo[i]);
  }
  return properties;
};

MxModel.prototype.request = function(message) {
  return this.mxmqtt.request(this.get('topic'), message);
};

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

MxModel.prototype.publish = function(message) {
  this.mxmqtt.publish(this.get('topic'), message);
};

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

MxModel.prototype.listen = function() {
  this.mxmqtt.listen();
  this.mxmqtt.mqtt.on('connect', this.connect.bind(this));
  this.mxmqtt.on('message', this.onMessage.bind(this));
  this.mxmqtt.mqtt.on('close', this.close.bind(this));
};

MxModel.prototype.setMxMqtt = function(setting, value) {
  return this.mxmqtt.set(setting, value);
};

MxModel.prototype.getMxMqtt = function(setting) {
  return this.mxmqtt.get(setting);
};

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

var parseParam = function(url) {

  var names = [],
      matches = url.match(/:([\w\_\-]+)/g);

  matches = matches ? matches : [];

  matches.forEach(function(name) {
    names.push(name.replace(':', ''));
  });

  return names;
};

var resourceToRegExp = function(resource) {
  var replacedStr = resource.replace(/:[\w\-]+/g, '([\\w\\-\\_]+)')
                      .replace(/\//g, '\\/');
  return new RegExp('^' + replacedStr + '$');
};

['get', 'post', 'put', 'delete'].forEach(function(method) {

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

MxModel.prototype.close = function() {

  var self = this;
  self.disable('registered');
  log.warn("[%s] MxMQTT can't connect to %s", self.getMxMqtt('name'), self.getMxMqtt('host') + ':' + self.getMxMqtt('port'));
};

exports = module.exports = MxModel;

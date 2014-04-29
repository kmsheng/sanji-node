'use strict';
/**
 * MxCloud Model
 */

var crypto = require('crypto'),
    eventEmitter = require('events').EventEmitter,
    log = require('bunyan').log,
    url = require('url'),
    mixin = require('utils-merge'),
    mxmodel = {},
    mxmqtt = require('./mxmqtt'),
    q = require('q'),
    qs = require('qs'),
    utils = require('./mxutils');

mxmodel.defaultConfig = function() {

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

  this.callbacks = [];
};

mxmodel.setTunnel = function(newTunnel) {

  var deferred = q.defer(),
      name = this.get('name'),
      tunnel = this.get('tunnel');

  // unsubscribe the old tunnel
  if (null !== tunnel && tunnel !== newTunnel) {

    this.mxmqtt.unsubscribe(tunnel)
      .then(function() {
        log.debug('[%s] Unsubscribe %s', name, tunnel)
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

mxmodel.deregister = function() {

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
    deferred.reject();
    log.debug('[%s] De-Register error !', name);
  });

  log.debug('[%s] De-Register request is sent', name);

  return deferred.promise;
};

mxmodel.getRegistrationInfo = function() {

  var modelInfo = ['name', 'resources', 'role', 'hook', 'description', 'tunnel', 'ttl'],
      properties = {};

  for (var i = modelInfo.length - 1; i >= 0; i--) {
    properties[modelInfo[i]] = this.get(modelInfo[i]);
  }
  return properties;
};

mxmodel.request = function(message) {
  return this.mxmqtt.request(this.get('topic'), message);
};

mxmodel.register = function() {

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

mxmodel.publish = function(message) {
  this.mxmqtt.publish(this.get('topic'), message);
};

mxmodel.listen = function() {
  this.mxmqtt.listen();
  this.mxmqtt.mqtt.on('connect', mxmodel.connect);

  this.mxmqtt.on('message', function(topic, message) {

    var callback = mxmodel.callbacks[message.resource + ':' + message.method];

    if ('function' === typeof callback) {
      callback(message);
    }
  });

  this.mxmqtt.mqtt.on('close', mxmodel.close);
};

mxmodel.setMxMqtt = function(setting, value) {
  return this.mxmqtt.set(setting, value);
};

mxmodel.getMxMqtt = function(setting) {
  return this.mxmqtt.get(setting);
};

mxmodel.connect = function() {

  var self = mxmodel,
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

['get', 'post', 'put', 'delete'].forEach(function(method) {

  mxmodel[method] = function(key, callback) {

    if ((1 === arguments.length) && ('get' === method)) {
      return this.settings[key];
    }
    var resource = key;
    this.callbacks[resource + ':' + method] = callback;
  };
});

mxmodel.close = function() {

  var self = mxmodel;
  self.disable('registered');
  log.warn("[%s] MxMQTT can't connect to %s", self.getMxMqtt('name'), self.getMxMqtt('host') + ':' + self.getMxMqtt('port'));
};

function createMxModel(options) {

  mixin(mxmodel, utils);
  mixin(mxmodel, eventEmitter.prototype);

  mxmodel.init();
  mxmodel.defaultConfig();

  mxmodel.mxmqtt = mxmqtt();

  options = options || {};
  options.host = options.host || 'localhost';
  options.port = options.port || 1883;

  mxmodel.setMxMqtt('host', options.host);
  mxmodel.setMxMqtt('port', options.port);

  return mxmodel;
}

exports = module.exports = createMxModel;


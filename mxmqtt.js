'use strict';

/**
 * MxCloud MQTT
 */

var eventEmitter = require('events').EventEmitter,
    log = require('bunyan').log,
    mixin = require('utils-merge'),
    mqtt = require('mqtt'),
    mxmqtt = {},
    q = require('q'),
    utils = require('./mxutils');

/**
 * Expose `createMxMqtt()`.
 */

exports = module.exports = createMxMqtt;

/**
 * Apply default config.
 *
 * @api private
 */

mxmqtt.defaultConfig = function() {
  this.set('name', 'MxMqtt');
  this.set('port', 1883);
  this.set('host', 'localhost');
  this.set('messageOptions', {qos: 2});
};

/**
 * Receive MQTT messages.
 *
 * @api private
 */

mxmqtt.receive = function(topic, message) {

    var parsedMessage;

    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      log.warn('mxmqtt.receive parsed json failed: %s', message);
    }

    if ('object' === typeof parsedMessage) {
      message = parsedMessage;
    }

    if (this.isValidResponseFormat(message)) {

      if (! this.deferredList.hasOwnProperty(message.id)) {
        log.info('A message without message ID.', message);
        return false;
      }

      if (200 === message.code) {
        this.deferredList[message.id].resolve(message);
      } else {
        this.deferredList[message.id].reject(message);
      }
      delete this.deferredList[message.id];
      return true;
    }

    if (this.isValidRequestFormat(message)) {
      this.emit('message', topic, message);
      return true;
    }

};

/**
 * Get the settings' value.
 *
 * @api public
 */

mxmqtt.get = function(setting) {
  return this.settings[setting];
};

/**
 * Start listening to MQTT message.
 *
 * @api public
 */

mxmqtt.listen = function() {

  this.mqtt = mqtt.createClient(this.get('port'), this.get('host'));
  this.mqtt.on('message', this.receive.bind(this));
};

/**
 * Generate random message id based on min and max params.
 *
 * @api private
 */

mxmqtt.genMessageId = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Set message id if it doesn't have one
 *
 * @api private
 */

mxmqtt.setMessageId = function(message) {

  if (('object' === typeof message) && !message.hasOwnProperty('id')) {
    message.id = this.genMessageId(1, 10000);
  }
  return message;
};

/**
 * Subscribe a topic
 *
 * @api public
 */

mxmqtt.subscribe = function(topic, options) {

  var deferred = q.defer();

  this.mqtt.subscribe(topic, options, function(err, granted) {

    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve();
    }
  });

  return deferred.promise;
};

/**
 * Unsubscribe a topic.
 *
 * @api public
 */

mxmqtt.unsubscribe = function(topic) {

  var deferred = q.defer();

  this.mqtt.unsubscribe(topic, function(err, granted) {
      deferred.resolve();
  });

  return deferred.promise;
};

/**
 * Publish a MQTT message.
 *
 * @api public
 */
mxmqtt.publish = function(topic, message) {

  var parsedMessage = JSON.stringify(message);

  this.mqtt.publish(topic, parsedMessage, this.get('messageOptions'));
};

/**
 * Check if it's a valid request format.
 *
 * @api public
 */
mxmqtt.isValidRequestFormat = function(message) {
  return ('object' === typeof message) && message.id && message.method && message.resource;
};

/**
 * Check if it's a valid response format.
 *
 * @api public
 */
mxmqtt.isValidResponseFormat = function(message) {
  return ('object' === typeof message) && message.id && message.code;
};

/**
 * Send a request.
 *
 * @api public
 */
mxmqtt.request = function(topic, message) {

  var deferred = q.defer();

  message = this.setMessageId(message);

  if (! this.isValidRequestFormat(message)) {
    log.error('Invalid request format.');
    deferred.reject();
  } else {

    this.deferredList[message.id] = deferred;
    this.publish(topic, message);
  }
  log.trace('request', topic, message);

  return deferred.promise;
};

/**
 * Publish MQTT message.
 *
 * @return {Function}
 * @api public
 */

function createMxMqtt() {

  mixin(mxmqtt, utils);
  mixin(mxmqtt, eventEmitter.prototype);

  mxmqtt.init();
  mxmqtt.defaultConfig();
  mxmqtt.deferredList = {};

  return mxmqtt;
}


var eventEmitter = require('events').EventEmitter,
    util = require('util');

function MxUtils() {

  this.settings = {};
  eventEmitter.call(this);
}

util.inherits(MxUtils, eventEmitter);

/**
 * Set the settings' value.
 *
 * @api public
 */

MxUtils.prototype.set = function(setting, value) {
  this.settings[setting] = value;
  return this;
};

/**
 * Enable `settings`.
 *
 * @api public
 */

MxUtils.prototype.enable = function(setting) {
  return this.set(setting, true);
};

/**
 * Disable `settings`.
 *
 * @api public
 */

MxUtils.prototype.disable = function(setting) {
  return this.set(setting, false);
};

/**
 * Check if `settings` is enabled.
 *
 * @api public
 */

MxUtils.prototype.enabled = function(setting) {
  return !!this.get(setting);
};

/**
 * Check if `settings` is disabled.
 *
 * @api public
 */
MxUtils.prototype.disabled = function(setting) {
  return !this.get(setting);
};

exports = module.exports = MxUtils;

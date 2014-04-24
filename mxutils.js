
/**
 * Initialize default settings.
 *
 * @api public
 */
exports.init = function() {
  this.settings = {};
};

/**
 * Get the settings' value.
 *
 * @api public
 */

exports.get = function(setting) {
  return this.settings[setting];
};

/**
 * Set the settings' value.
 *
 * @api public
 */

exports.set = function(setting, value) {
  this.settings[setting] = value;
  return this;
};

/**
 * Enable `settings`.
 *
 * @api public
 */

exports.enable = function(setting) {
  return this.set(setting, true);
};

/**
 * Disable `settings`.
 *
 * @api public
 */

exports.disable = function(setting) {
  return this.set(setting, false);
};

/**
 * Check if `settings` is enabled.
 *
 * @api public
 */

exports.enabled = function(setting) {
  return !!this.get(setting);
};

/**
 * Check if `settings` is disabled.
 *
 * @api public
 */
exports.disabled = function(setting) {
  return !this.get(setting);
};

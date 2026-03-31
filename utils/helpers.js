/**
 * Helper utilities for date checks, formatting, etc.
 */

/**
 * Check if a subscription has expired
 * @param {Date} expiresAt - subscription expiration date
 * @returns {boolean} true if expired, false if still active
 */
function isSubscriptionExpired(expiresAt) {
  if (!expiresAt) return true;
  return new Date() > new Date(expiresAt);
}

/**
 * Add days to current date
 * @param {number} days - number of days to add
 * @returns {Date} future date
 */
function addDaysToNow(days) {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return future;
}

/**
 * Format phone number (remove +, keep digits)
 * @param {string} phone - phone number from WhatsApp
 * @returns {string} formatted phone number
 */
function formatPhoneNumber(phone) {
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Generate a unique quiz ID
 * @returns {string} unique ID
 */
function generateQuizId() {
  return `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sleep for milliseconds (for delays)
 * @param {number} ms - milliseconds
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  isSubscriptionExpired,
  addDaysToNow,
  formatPhoneNumber,
  generateQuizId,
  sleep
};

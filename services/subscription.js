/**
 * Subscription & User Management Service
 * Handles user creation, subscription checking, activation
 */

const admin = require('firebase-admin');
const { addDaysToNow, isSubscriptionExpired } = require('../utils/helpers');

const db = admin.firestore();
const USERS_COLLECTION = 'users';
const TRIAL_DAYS = parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS) || 7;

/**
 * Get or create user (auto-activate on first interaction)
 * @param {string} phoneNumber - user phone number (document ID)
 * @returns {Promise<Object>} user document
 */
async function getOrCreateUser(phoneNumber) {
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(phoneNumber);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      console.log(`[Subscription] User ${phoneNumber} exists`);
      return userDoc.data();
    }

    // Create new user with 7-day trial
    const now = new Date();
    const expiresAt = addDaysToNow(TRIAL_DAYS);

    const newUser = {
      phoneNumber,
      createdAt: admin.firestore.Timestamp.fromDate(now),
      subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      isActive: true
    };

    await userRef.set(newUser);
    console.log(`[Subscription] Created new user ${phoneNumber}, active until ${expiresAt.toISOString()}`);

    return newUser;
  } catch (error) {
    console.error('[Subscription] Error in getOrCreateUser:', error.message);
    throw error;
  }
}

/**
 * Check if user's subscription is active
 * @param {string} phoneNumber - user phone number
 * @returns {Promise<boolean>} true if active, false if expired
 */
async function checkIsActive(phoneNumber) {
  try {
    const user = await getOrCreateUser(phoneNumber);
    
    // Check expiration
    const expiresAt = user.subscriptionExpiresAt?.toDate?.() || new Date(user.subscriptionExpiresAt);
    const expired = isSubscriptionExpired(expiresAt);

    if (expired && user.isActive) {
      // Mark user as inactive
      await db.collection(USERS_COLLECTION).doc(phoneNumber).update({
        isActive: false
      });
      console.log(`[Subscription] Marked ${phoneNumber} as inactive`);
      return false;
    }

    return !expired;
  } catch (error) {
    console.error('[Subscription] Error checking subscription:', error.message);
    throw error;
  }
}

/**
 * Extend user subscription (for payment flow in future)
 * @param {string} phoneNumber - user phone number
 * @param {number} days - days to extend (default 30)
 * @returns {Promise<Object>} updated user
 */
async function extendSubscription(phoneNumber, days = 30) {
  try {
    const expiresAt = addDaysToNow(days);

    await db.collection(USERS_COLLECTION).doc(phoneNumber).update({
      subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      isActive: true
    });

    console.log(`[Subscription] Extended ${phoneNumber} by ${days} days`);
    return { success: true, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    console.error('[Subscription] Error extending subscription:', error.message);
    throw error;
  }
}

/**
 * Get user subscription status
 * @param {string} phoneNumber - user phone number
 * @returns {Promise<Object>} subscription info
 */
async function getSubscriptionStatus(phoneNumber) {
  try {
    const user = await getOrCreateUser(phoneNumber);
    const expiresAt = user.subscriptionExpiresAt?.toDate?.() || new Date(user.subscriptionExpiresAt);
    const isActive = !isSubscriptionExpired(expiresAt);

    return {
      phoneNumber,
      isActive,
      expiresAt: expiresAt.toISOString(),
      createdAt: user.createdAt?.toDate?.()?.toISOString() || new Date(user.createdAt).toISOString()
    };
  } catch (error) {
    console.error('[Subscription] Error getting status:', error.message);
    throw error;
  }
}

module.exports = {
  getOrCreateUser,
  checkIsActive,
  extendSubscription,
  getSubscriptionStatus
};

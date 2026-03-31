/**
 * WhatsApp API Service
 * Handles sending messages, managing interactive buttons, etc.
 */

const axios = require('axios');

const WHATSAPP_API_URL = 'https://graph.instagram.com/v18.0';
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

/**
 * Send a text message to WhatsApp user
 * @param {string} to - recipient phone number
 * @param {string} text - message text
 * @returns {Promise<Object>} API response
 */
async function sendTextMessage(to, text) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    console.log(`[WhatsApp] Text sent to ${to}`);
    return response.data;
  } catch (error) {
    console.error('[WhatsApp] Error sending text:', error.message);
    throw error;
  }
}

/**
 * Send interactive message with buttons (e.g., quiz options A/B/C/D)
 * @param {string} to - recipient phone number
 * @param {string} headerText - header text
 * @param {string} bodyText - body text
 * @param {Array} buttons - array of objects { id, title } (max 3 buttons)
 * @returns {Promise<Object>} API response
 */
async function sendInteractiveMessage(to, headerText, bodyText, buttons) {
  try {
    // Map buttons to WhatsApp format
    const formattedButtons = buttons.map((btn, idx) => ({
      type: 'reply',
      reply: {
        id: btn.id,
        title: btn.title.substring(0, 20) // WhatsApp limits button text
      }
    }));

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          header: {
            type: 'text',
            text: headerText
          },
          body: {
            text: bodyText
          },
          action: {
            buttons: formattedButtons
          }
        }
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    console.log(`[WhatsApp] Interactive message sent to ${to}`);
    return response.data;
  } catch (error) {
    console.error('[WhatsApp] Error sending interactive:', error.message);
    throw error;
  }
}

/**
 * Send message with quick reply list (for menu options)
 * @param {string} to - recipient phone number
 * @param {string} bodyText - message body
 * @param {Array} options - array of { id, title }
 * @returns {Promise<Object>} API response
 */
async function sendListMessage(to, bodyText, options) {
  try {
    const rows = options.map((opt, idx) => ({
      id: opt.id,
      title: opt.title,
      description: opt.description || ''
    }));

    const response = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: 'Choose',
            sections: [
              {
                title: 'Options',
                rows: rows
              }
            ]
          }
        }
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    console.log(`[WhatsApp] List message sent to ${to}`);
    return response.data;
  } catch (error) {
    console.error('[WhatsApp] Error sending list:', error.message);
    throw error;
  }
}

/**
 * Mark message as read
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<Object>} API response
 */
async function markAsRead(messageId) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return response.data;
  } catch (error) {
    console.error('[WhatsApp] Error marking as read:', error.message);
  }
}

module.exports = {
  sendTextMessage,
  sendInteractiveMessage,
  sendListMessage,
  markAsRead
};

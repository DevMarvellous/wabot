/**
 * Download PDF from WhatsApp media URL
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Download media from WhatsApp CDN
 * @param {string} mediaId - WhatsApp media ID
 * @param {string} accessToken - WhatsApp access token
 * @returns {Promise<Buffer>} file buffer
 */
async function downloadMediaFromWhatsApp(mediaId, accessToken) {
  try {
    // Step 1: Get media URL
    const mediaUrlResponse = await axios.get(
      `https://graph.instagram.com/v18.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const mediaUrl = mediaUrlResponse.data?.url;
    if (!mediaUrl) {
      throw new Error('Failed to get media URL from WhatsApp');
    }

    console.log(`[MediaDownloader] Got media URL for ${mediaId}`);

    // Step 2: Download the actual file
    const fileResponse = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer'
    });

    const fileBuffer = Buffer.from(fileResponse.data);
    console.log(`[MediaDownloader] Downloaded ${fileBuffer.length} bytes`);

    return fileBuffer;
  } catch (error) {
    console.error('[MediaDownloader] Error:', error.message);
    throw error;
  }
}

/**
 * Save buffer to temporary file
 * @param {Buffer} buffer - file buffer
 * @param {string} filename - output filename
 * @returns {string} file path
 */
function saveTempFile(buffer, filename) {
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, buffer);
  console.log(`[MediaDownloader] Saved to ${filePath}`);
  
  return filePath;
}

/**
 * Clean up temporary file
 * @param {string} filePath - path to file
 */
function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[MediaDownloader] Cleaned up ${filePath}`);
    }
  } catch (error) {
    console.error('[MediaDownloader] Error cleaning up:', error.message);
  }
}

module.exports = {
  downloadMediaFromWhatsApp,
  saveTempFile,
  cleanupTempFile
};

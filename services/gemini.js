/**
 * Gemini AI Service
 * Handles PDF upload via Files API and quiz generation
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/files';
const MODEL = 'gemini-2.5-flash'; // or gemini-2.0-flash-exp

/**
 * Upload PDF to Gemini Files API
 * @param {string} filePath - path to PDF file
 * @param {string} mimeType - MIME type (application/pdf)
 * @returns {Promise<string>} Gemini file URI
 */
async function uploadPdfToGemini(filePath, mimeType = 'application/pdf') {
  try {
    const fileStream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);

    // Create form data for multipart upload
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fileStream, fileName);

    console.log(`[Gemini] Uploading PDF: ${fileName}`);

    const response = await axios.post(GEMINI_API_URL, form, {
      headers: {
        ...form.getHeaders(),
        'X-Goog-Api-Key': GEMINI_API_KEY
      }
    });

    const fileUri = response.data?.file?.uri;
    if (!fileUri) {
      throw new Error('No file URI returned from Gemini');
    }

    console.log(`[Gemini] PDF uploaded successfully: ${fileUri}`);
    return fileUri;
  } catch (error) {
    console.error('[Gemini] Error uploading PDF:', error.message);
    throw error;
  }
}

/**
 * Generate quiz from PDF using Gemini
 * @param {string} fileUri - Gemini file URI from uploaded PDF
 * @returns {Promise<Array>} array of quiz questions
 */
async function generateQuizFromPdf(fileUri) {
  try {
    console.log(`[Gemini] Generating quiz from ${fileUri}`);

    const prompt = `You are an expert educational content creator. You have been provided with lecture notes in PDF format.

YOUR TASK: Generate exactly 8-10 high-quality multiple-choice quiz questions based ONLY on the content in the provided PDF lecture notes.

REQUIREMENTS:
1. Each question must be clear, concise, and test comprehension or application of concepts.
2. Include 4 options (A, B, C, D) for each question.
3. Exactly one option must be correct.
4. Options should be realistic distractors (no obviously wrong answers).
5. Include a brief educational explanation for the correct answer.
6. Maintain university-level academic rigor.
7. Questions should cover different topics/sections of the notes.

RESPONSE FORMAT: Return ONLY a valid JSON array (no additional text). Structure:
[
  {
    "question": "What is the definition of X?",
    "options": {
      "A": "First option",
      "B": "Second option",
      "C": "Third option",
      "D": "Fourth option"
    },
    "correctAnswer": "A",
    "explanation": "Short explanation of why A is correct."
  }
]

Start your response with [ and end with ]. Only return the JSON array.`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              },
              {
                fileData: {
                  mimeType: 'application/pdf',
                  fileUri: fileUri
                }
              }
            ]
          }
        ]
      },
      {
        headers: { 'X-Goog-Api-Key': GEMINI_API_KEY }
      }
    );

    const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!responseText) {
      throw new Error('No response from Gemini');
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Gemini response');
    }

    const quizData = JSON.parse(jsonMatch[0]);
    console.log(`[Gemini] Generated ${quizData.length} questions`);

    return quizData;
  } catch (error) {
    console.error('[Gemini] Error generating quiz:', error.message);
    console.error('[Gemini] Response:', error.response?.data || 'No response data');
    throw error;
  }
}

/**
 * Test Gemini connection
 * @returns {Promise<boolean>} true if connection works
 */
async function testGeminiConnection() {
  try {
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`,
      {
        headers: { 'X-Goog-Api-Key': GEMINI_API_KEY }
      }
    );

    console.log('[Gemini] Connection test successful');
    return true;
  } catch (error) {
    console.error('[Gemini] Connection test failed:', error.message);
    return false;
  }
}

module.exports = {
  uploadPdfToGemini,
  generateQuizFromPdf,
  testGeminiConnection
};

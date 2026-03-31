/**
 * Main Express Server & WhatsApp Webhook Handler
 */

require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';
const serviceAccount = require(path.resolve(serviceAccountPath));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID
});

// Import services
const whatsappService = require('./services/whatsapp');
const subscriptionService = require('./services/subscription');
const quizService = require('./services/quiz');
const geminiService = require('./services/gemini');
const mediaDownloader = require('./utils/mediaDownloader');
const { formatPhoneNumber, sleep } = require('./utils/helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

app.use(express.json());

// ============================================================================
// WEBHOOK VERIFICATION (GET /webhook)
// ============================================================================

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook] Verified');
    res.status(200).send(challenge);
  } else {
    console.log('[Webhook] Verification failed');
    res.status(403).send('Unauthorized');
  }
});

// ============================================================================
// WEBHOOK MESSAGE HANDLER (POST /webhook)
// ============================================================================

app.post('/webhook', async (req, res) => {
  try {
    // Acknowledge immediately (WhatsApp requires response within 20s)
    res.status(200).send('OK');

    const body = req.body;

    // Handle status updates (suppress logging for these)
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
      console.log('[Webhook] Received message status update');
      return;
    }

    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages || [];
    const messageData = messages[0];

    if (!messageData) {
      return;
    }

    // Extract basic info
    const from = formatPhoneNumber(messageData.from);
    const messageId = messageData.id;
    const timestamp = messageData.timestamp;
    const messageType = messageData.type;

    console.log(`[Webhook] From: ${from}, Type: ${messageType}`);

    // Mark as read
    await whatsappService.markAsRead(messageId);

    // Route based on message type
    if (messageType === 'text') {
      await handleTextMessage(from, messageData.text.body);
    } else if (messageType === 'document') {
      await handleDocumentMessage(from, messageData.document);
    } else if (messageType === 'interactive') {
      await handleInteractiveMessage(from, messageData.interactive);
    } else {
      await whatsappService.sendTextMessage(
        from,
        '❌ Unsupported message type. Please send text or upload a PDF.'
      );
    }
  } catch (error) {
    console.error('[Webhook] Error processing message:', error.message);
  }
});

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Handle text messages (start, hello, retake, etc.)
 */
async function handleTextMessage(from, text) {
  const lowerText = text.toLowerCase().trim();

  try {
    // Check subscription first
    const isActive = await subscriptionService.checkIsActive(from);

    if (!isActive) {
      await whatsappService.sendTextMessage(
        from,
        '❌ Your free trial has expired. Please pay the activation fee to continue using the quiz bot.\n\nTo get started again, contact our support team.'
      );
      return;
    }

    // Handle "start" or "hello"
    if (
      lowerText === 'start' ||
      lowerText === 'hi' ||
      lowerText === 'hello' ||
      lowerText === 'begun' ||
      text.length < 10
    ) {
      await sendWelcomeMessage(from);
      return;
    }

    // Handle "retake"
    if (lowerText === 'retake') {
      await quizService.clearQuiz(from);
      await sendWelcomeMessage(from);
      return;
    }

    // Default response
    await whatsappService.sendTextMessage(
      from,
      '📚 Please upload a PDF of your lecture notes to generate a quiz!\n\nOr type "retake" to take the quiz again.'
    );
  } catch (error) {
    console.error(`[Handler] Error handling text message from ${from}:`, error.message);
    await whatsappService.sendTextMessage(from, '⚠️ An error occurred. Please try again.');
  }
}

/**
 * Handle PDF/document uploads
 */
async function handleDocumentMessage(from, documentData) {
  let tempFilePath = null;

  try {
    // Check subscription
    const isActive = await subscriptionService.checkIsActive(from);

    if (!isActive) {
      await whatsappService.sendTextMessage(
        from,
        '❌ Your free trial has expired. Please pay the activation fee to continue using the quiz bot.'
      );
      return;
    }

    // Validate document is PDF
    const mimeType = documentData.mime_type;
    if (mimeType !== 'application/pdf') {
      await whatsappService.sendTextMessage(
        from,
        '❌ Only PDF files are supported. Please upload a PDF of your lecture notes.'
      );
      return;
    }

    // Send waiting message
    await whatsappService.sendTextMessage(
      from,
      '⏳ Processing your lecture notes... This may take 10-15 seconds.'
    );

    // Download PDF
    const mediaId = documentData.id;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const fileBuffer = await mediaDownloader.downloadMediaFromWhatsApp(mediaId, accessToken);
    tempFilePath = mediaDownloader.saveTempFile(fileBuffer, `lecture_${from}_${Date.now()}.pdf`);

    // Upload to Gemini
    const geminiFileUri = await geminiService.uploadPdfToGemini(tempFilePath, mimeType);

    // Generate quiz
    const questions = await geminiService.generateQuizFromPdf(geminiFileUri);

    if (!questions || questions.length === 0) {
      await whatsappService.sendTextMessage(
        from,
        '❌ Could not generate quiz from the PDF. Please try a different document.'
      );
      return;
    }

    // Save quiz to Firestore
    await quizService.saveQuiz(from, questions, geminiFileUri);

    // Get first question
    const firstQuestion = await quizService.getCurrentQuestion(from);

    // Send first question
    await sendQuizQuestion(from, firstQuestion);
  } catch (error) {
    console.error(`[Handler] Error handling document from ${from}:`, error.message);
    if (error.message.includes('PDF')) {
      await whatsappService.sendTextMessage(
        from,
        '❌ Failed to process PDF. Please ensure the file is a valid PDF document.'
      );
    } else {
      await whatsappService.sendTextMessage(
        from,
        '⚠️ Error generating quiz. Please try uploading a different document.'
      );
    }
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      mediaDownloader.cleanupTempFile(tempFilePath);
    }
  }
}

/**
 * Handle interactive button replies (quiz answers)
 */
async function handleInteractiveMessage(from, interactiveData) {
  try {
    const buttonReply = interactiveData.button_reply;
    const answerId = buttonReply?.id;

    if (!answerId) {
      console.log('[Handler] No button ID in interactive message');
      return;
    }

    // Check if this is a button press for quiz answer (A/B/C/D)
    if (!['A', 'B', 'C', 'D'].includes(answerId)) {
      console.log(`[Handler] Unknown button ID: ${answerId}`);
      return;
    }

    // Check subscription
    const isActive = await subscriptionService.checkIsActive(from);
    if (!isActive) {
      await whatsappService.sendTextMessage(
        from,
        '❌ Your free trial has expired. Please pay to continue.'
      );
      return;
    }

    // Submit answer
    const result = await quizService.submitAnswer(from, answerId);

    // Send feedback
    if (result.isCorrect) {
      await whatsappService.sendTextMessage(
        from,
        `✅ Correct!\n\n📖 ${result.explanation}`
      );
    } else {
      await whatsappService.sendTextMessage(
        from,
        `❌ Wrong. The correct answer is **${result.correctAnswer}**.\n\n📖 ${result.explanation}`
      );
    }

    // Small delay for readability
    await sleep(1000);

    // Send score update
    await whatsappService.sendTextMessage(
      from,
      `\n📊 Score: ${result.newScore}/${result.totalScore}`
    );

    // Check if quiz is completed
    if (result.isCompleted) {
      await sleep(1000);

      // Send final results
      const percentage = Math.round((result.newScore / result.totalScore) * 100);
      let message = `🎉 Quiz Completed!\n\n`;
      message += `📊 Final Score: ${result.newScore}/${result.totalScore} (${percentage}%)\n\n`;

      if (percentage >= 80) {
        message += `🌟 Excellent work! You've mastered this material.`;
      } else if (percentage >= 60) {
        message += `👍 Good job! Review the concepts you missed.`;
      } else {
        message += `📚 Keep studying! Review your lecture notes.`;
      }

      await whatsappService.sendTextMessage(from, message);

      await sleep(1000);

      // Send retake/upload buttons
      await sendQuizCompletionOptions(from);
    } else {
      // Send next question
      await sleep(500);
      const nextQuestion = result.nextQuestion;
      await sendQuizQuestion(from, nextQuestion);
    }
  } catch (error) {
    console.error(`[Handler] Error handling interactive message from ${from}:`, error.message);
    await whatsappService.sendTextMessage(
      from,
      '⚠️ Error processing your answer. Please try again.'
    );
  }
}

// ============================================================================
// MESSAGE BUILDERS
// ============================================================================

/**
 * Send welcome message
 */
async function sendWelcomeMessage(from) {
  const welcomeText = `Welcome to LectureQuiz Bot! 📚\n\nUpload your lecture notes (PDF) to generate a personalized quiz.\n\nOnce uploaded, you'll receive smart questions generated by AI with instant feedback.`;

  await whatsappService.sendTextMessage(from, welcomeText);
}

/**
 * Send quiz question with answer buttons
 */
async function sendQuizQuestion(from, question) {
  try {
    const headerText = `Question ${question.questionNumber}/${question.totalQuestions}`;
    const bodyText = question.question;

    const buttons = [
      { id: 'A', title: `A: ${question.options.A.substring(0, 20)}...` },
      { id: 'B', title: `B: ${question.options.B.substring(0, 20)}...` },
      { id: 'C', title: `C: ${question.options.C.substring(0, 20)}...` },
      { id: 'D', title: `D: ${question.options.D.substring(0, 20)}...` }
    ];

    // Send full question text first
    await whatsappService.sendTextMessage(
      from,
      `Question ${question.questionNumber}/${question.totalQuestions}\n\n${question.question}`
    );

    // Small delay
    await sleep(500);

    // Send buttons for answers
    await whatsappService.sendInteractiveMessage(
      from,
      'Select your answer:',
      'Choose one option below',
      buttons
    );
  } catch (error) {
    console.error('[QuizQuestion] Error sending question:', error.message);
    throw error;
  }
}

/**
 * Send quiz completion options (retake or upload new)
 */
async function sendQuizCompletionOptions(from) {
  const options = [
    { id: 'retake', title: 'Retake Quiz', description: 'Answer same questions again' },
    { id: 'new', title: 'Upload New Notes', description: 'Generate new quiz' }
  ];

  await whatsappService.sendListMessage(
    from,
    'What would you like to do?',
    options
  );
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================================================
// ERROR HANDLING & STARTUP
// ============================================================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection:', reason);
});

app.listen(PORT, async () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Webhook URL: /webhook`);
  console.log(`[Server] Verify Token: ${WEBHOOK_VERIFY_TOKEN}`);

  // Test Gemini connection
  const geminiOk = await geminiService.testGeminiConnection();
  if (!geminiOk) {
    console.warn('[Server] ⚠️ Gemini connection test failed. Check your API key.');
  }

  console.log('[Server] ✅ Bot ready to receive messages!');
});

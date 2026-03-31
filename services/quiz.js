/**
 * Quiz Management Service
 * Handles quiz state, progress, scoring
 */

const admin = require('firebase-admin');
const { generateQuizId } = require('../utils/helpers');

const db = admin.firestore();
const QUIZZES_COLLECTION = 'quizzes';

/**
 * Save quiz to Firestore
 * @param {string} phoneNumber - user phone number
 * @param {Array} questions - quiz questions
 * @param {string} pdfUrl - URL/URI of the PDF
 * @returns {Promise<Object>} quiz document
 */
async function saveQuiz(phoneNumber, questions, pdfUrl) {
  try {
    const quizId = generateQuizId();
    const now = new Date();

    const quizData = {
      phoneNumber,
      quizId,
      questions,
      currentQuestionIndex: 0,
      score: 0,
      answers: [],
      pdfUrl,
      createdAt: admin.firestore.Timestamp.fromDate(now),
      status: 'active' // active, completed
    };

    await db.collection(QUIZZES_COLLECTION).doc(phoneNumber).set(quizData);
    console.log(`[Quiz] Saved quiz ${quizId} for ${phoneNumber}`);

    return quizData;
  } catch (error) {
    console.error('[Quiz] Error saving quiz:', error.message);
    throw error;
  }
}

/**
 * Get current quiz state for user
 * @param {string} phoneNumber - user phone number
 * @returns {Promise<Object|null>} quiz data or null if no active quiz
 */
async function getQuiz(phoneNumber) {
  try {
    const quizDoc = await db.collection(QUIZZES_COLLECTION).doc(phoneNumber).get();

    if (!quizDoc.exists) {
      return null;
    }

    return quizDoc.data();
  } catch (error) {
    console.error('[Quiz] Error getting quiz:', error.message);
    throw error;
  }
}

/**
 * Get current question
 * @param {string} phoneNumber - user phone number
 * @returns {Promise<Object|null>} current question or null
 */
async function getCurrentQuestion(phoneNumber) {
  try {
    const quiz = await getQuiz(phoneNumber);
    
    if (!quiz) {
      return null;
    }

    const currentIdx = quiz.currentQuestionIndex;
    if (currentIdx >= quiz.questions.length) {
      return null; // Quiz completed
    }

    return {
      ...quiz.questions[currentIdx],
      questionNumber: currentIdx + 1,
      totalQuestions: quiz.questions.length
    };
  } catch (error) {
    console.error('[Quiz] Error getting current question:', error.message);
    throw error;
  }
}

/**
 * Submit answer and move to next question
 * @param {string} phoneNumber - user phone number
 * @param {string} answer - answer choice (A/B/C/D)
 * @returns {Promise<Object>} { isCorrect, correctAnswer, explanation, nextQuestion }
 */
async function submitAnswer(phoneNumber, answer) {
  try {
    const quiz = await getQuiz(phoneNumber);
    
    if (!quiz) {
      throw new Error('No active quiz found');
    }

    const currentIdx = quiz.currentQuestionIndex;
    const currentQuestion = quiz.questions[currentIdx];
    const isCorrect = answer.toUpperCase() === currentQuestion.correctAnswer;

    // Update score and answers
    let newScore = quiz.score;
    if (isCorrect) {
      newScore += 1;
    }

    quiz.answers.push({
      questionIndex: currentIdx,
      userAnswer: answer.toUpperCase(),
      isCorrect,
      timestamp: admin.firestore.Timestamp.now()
    });

    // Move to next question
    quiz.currentQuestionIndex += 1;

    // Check if quiz is completed
    let isCompleted = false;
    if (quiz.currentQuestionIndex >= quiz.questions.length) {
      quiz.status = 'completed';
      isCompleted = true;
    }

    // Update Firestore
    await db.collection(QUIZZES_COLLECTION).doc(phoneNumber).update({
      currentQuestionIndex: quiz.currentQuestionIndex,
      score: newScore,
      answers: quiz.answers,
      status: quiz.status
    });

    console.log(`[Quiz] ${phoneNumber} answered Q${currentIdx + 1}: ${answer} (correct: ${isCorrect})`);

    // Get next question or null if completed
    let nextQuestion = null;
    if (!isCompleted) {
      const nextIdx = quiz.currentQuestionIndex;
      nextQuestion = {
        ...quiz.questions[nextIdx],
        questionNumber: nextIdx + 1,
        totalQuestions: quiz.questions.length
      };
    }

    return {
      isCorrect,
      correctAnswer: currentQuestion.correctAnswer,
      explanation: currentQuestion.explanation,
      newScore,
      nextQuestion,
      isCompleted,
      totalScore: quiz.questions.length
    };
  } catch (error) {
    console.error('[Quiz] Error submitting answer:', error.message);
    throw error;
  }
}

/**
 * Get final quiz results
 * @param {string} phoneNumber - user phone number
 * @returns {Promise<Object>} quiz results
 */
async function getQuizResults(phoneNumber) {
  try {
    const quiz = await getQuiz(phoneNumber);

    if (!quiz) {
      return null;
    }

    const percentage = Math.round((quiz.score / quiz.questions.length) * 100);

    return {
      quizId: quiz.quizId,
      totalQuestions: quiz.questions.length,
      score: quiz.score,
      percentage,
      answers: quiz.answers,
      createdAt: quiz.createdAt?.toDate?.()?.toISOString() || new Date(quiz.createdAt).toISOString()
    };
  } catch (error) {
    console.error('[Quiz] Error getting results:', error.message);
    throw error;
  }
}

/**
 * Clear current quiz (for retake or new upload)
 * @param {string} phoneNumber - user phone number
 * @returns {Promise<Object>} deletion result
 */
async function clearQuiz(phoneNumber) {
  try {
    await db.collection(QUIZZES_COLLECTION).doc(phoneNumber).delete();
    console.log(`[Quiz] Cleared quiz for ${phoneNumber}`);
    return { success: true };
  } catch (error) {
    console.error('[Quiz] Error clearing quiz:', error.message);
    throw error;
  }
}

module.exports = {
  saveQuiz,
  getQuiz,
  getCurrentQuestion,
  submitAnswer,
  getQuizResults,
  clearQuiz
};

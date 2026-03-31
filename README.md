# WhatsApp Quiz Bot - Complete Setup Guide

## Overview
This is a production-ready WhatsApp bot that allows users to upload lecture notes (PDF), generates AI-powered quizzes using Google Gemini, and delivers interactive quizzes with instant feedback.

**Key Features:**
- 📚 Auto-generate quizzes from lecture PDFs using Gemini AI
- ✅ Interactive quiz delivery via WhatsApp buttons
- 🔐 Automatic user management with 7-day free trial
- 📊 Real-time scoring and feedback
- 🔄 Retake & upload new notes options
- 🌐 Fully serverless (Firebase + Render)

---

## Project Structure

```
whatsapp-quiz-bot/
├── index.js                          # Main Express server & webhook
├── package.json                      # Dependencies
├── .env.example                      # Template for environment variables
├── .gitignore
├── serviceAccountKey.json            # Firebase credentials (gitignored)
├── utils/
│   ├── helpers.js                   # Date, formatting utilities
│   └── mediaDownloader.js           # WhatsApp media download & file handling
├── services/
│   ├── whatsapp.js                  # WhatsApp Cloud API calls
│   ├── subscription.js              # User & subscription management
│   ├── gemini.js                    # Gemini API & PDF upload
│   └── quiz.js                      # Quiz state & progress tracking
└── temp/                            # Temporary PDF storage (auto-created)
```

---

## Dependencies

```json
{
  "express": "^4.18.2",           // Web framework
  "dotenv": "^16.3.1",            // Environment variables
  "axios": "^1.6.2",              // HTTP client
  "firebase-admin": "^12.0.0",    // Firebase SDK
  "uuid": "^9.0.1",               // Unique IDs
  "nodemon": "^3.0.2"             // Dev auto-reload
}
```

---

## Installation

### Step 1: Clone and Install
```bash
git clone <your-repo-url>
cd whatsapp-quiz-bot
npm install
```

### Step 2: Set Up Environment
```bash
cp .env.example .env
# Edit .env with your credentials (see setup guide above)
```

### Step 3: Add Firebase Credentials
- Download `serviceAccountKey.json` from Firebase Console
- Place in project root (same directory as index.js)
- It's in .gitignore — never commit this file

### Step 4: Test Locally
```bash
npm run dev
# Server runs on http://localhost:3000
```

---

## Environment Variables Explained

| Variable | Source | Example |
|----------|--------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Meta Developer → App Roles → System User Token | `EAABs...` |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → Manage Phone Numbers → ID | `123456789` |
| `WEBHOOK_VERIFY_TOKEN` | You create this (any string) | `my_secure_token_12345` |
| `GEMINI_API_KEY` | ai.google.dev → Get API Key | `AIzaS...` |
| `FIREBASE_PROJECT_ID` | Firebase Console → Project Settings | `lecturequizbot` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to serviceAccountKey.json | `./serviceAccountKey.json` |
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | Server port (Render sets this) | `3000` |

---

## User Flow Explained

### 1️⃣ First Message (Any text)
```
User: "hi"
Bot: "Welcome to LectureQuiz Bot! 📚 Upload your lecture notes (PDF)..."
```

### 2️⃣ Check Subscription
- Extract phone number from WhatsApp message
- Query Firestore `users` collection by phone number
- **If new user:** Create record + activate for 7 days
- **If existing:** Check expiration date
  - Not expired? Continue
  - Expired? Show "trial expired" message and stop

### 3️⃣ PDF Upload Processing
```
User: [Uploads lecture_notes.pdf]
Bot: "⏳ Processing your lecture notes... (10-15s)"

Behind the scenes:
1. Download PDF from WhatsApp CDN (mediaDownloader.js)
2. Upload PDF to Gemini Files API
3. Call Gemini with PDF URI + prompt → get JSON quiz
4. Parse & validate questions
5. Save quiz to Firestore `quizzes` collection
6. Serve first question
```

### 4️⃣ Quiz Interaction
```
Bot: "Question 1/8: What is photosynthesis?"
      [Button A] [Button B] [Button C] [Button D]

User: [Taps Button C]
Bot: "✅ Correct! Explanation: ..."
     "📊 Score: 1/8"
     [Next question...]
```

### 5️⃣ Quiz Completion
```
After last question:
Bot: "🎉 Quiz Completed!"
     "📊 Final Score: 7/8 (87.5%)"
     "🌟 Excellent work!"
     [List: Retake Quiz / Upload New Notes]
```

---

## Firestore Database Structure

### Collection: `users`
```javascript
// Document ID: phoneNumber (e.g., "1234567890")
{
  phoneNumber: "1234567890",
  createdAt: Timestamp,
  subscriptionExpiresAt: Timestamp,
  isActive: boolean
}
```

### Collection: `quizzes`
```javascript
// Document ID: phoneNumber (latest quiz only)
{
  phoneNumber: "1234567890",
  quizId: "quiz_1234567890_abc123",
  questions: [
    {
      question: "What is X?",
      options: {
        A: "Option A",
        B: "Option B",
        C: "Option C",
        D: "Option D"
      },
      correctAnswer: "A",
      explanation: "Because..."
    },
    // ... more questions
  ],
  currentQuestionIndex: 3,  // 0-indexed
  score: 2,
  answers: [
    {
      questionIndex: 0,
      userAnswer: "A",
      isCorrect: true,
      timestamp: Timestamp
    },
    // ... more answers
  ],
  pdfUrl: "https://generativelanguage.googleapis.com/...",
  createdAt: Timestamp,
  status: "active" // or "completed"
}
```

---

## API Endpoints

### `GET /webhook`
WhatsApp verification. Called once during setup.
```bash
# WhatsApp sends:
GET /webhook?hub.mode=subscribe&hub.verify_token=..&hub.challenge=..
# Bot responds with challenge
```

### `POST /webhook`
Main message handler. WhatsApp sends:
- Text messages
- Document uploads (PDF)
- Interactive button presses

### `GET /health`
Health check (for uptime monitoring)
```bash
curl https://yourdomain.com/health
# Returns: { "status": "OK", "timestamp": "..." }
```

---

## Code Walkthrough

### `index.js` - Main Server
- **Webhook verification** (GET /webhook)
- **Message router** (POST /webhook → text/document/interactive)
- **`handleTextMessage()`** → Welcome, retake, etc.
- **`handleDocumentMessage()`** → PDF processing pipeline
- **`handleInteractiveMessage()`** → Quiz answer handling
- **`sendQuizQuestion()`** → Format & send question with buttons

### `services/whatsapp.js`
- `sendTextMessage()` → Simple text
- `sendInteractiveMessage()` → Buttons (A/B/C/D)
- `sendListMessage()` → Menu options
- `markAsRead()` → Read receipts

### `services/gemini.js`
- `uploadPdfToGemini()` → Gemini Files API
- `generateQuizFromPdf()` → Call Gemini with PDF, parse JSON response
- `testGeminiConnection()` → Verify API key works

### `services/subscription.js`
- `getOrCreateUser()` → Firestore lookup, auto-create with 7-day trial
- `checkIsActive()` → Expiration check
- `extendSubscription()` → For future payment flow
- `getSubscriptionStatus()` → User info

### `services/quiz.js`
- `saveQuiz()` → Store questions + state
- `getQuiz()` → Fetch current quiz
- `getCurrentQuestion()` → Get question by index
- `submitAnswer()` → Validate, update score, move to next
- `getQuizResults()` → Final stats

### `utils/mediaDownloader.js`
- `downloadMediaFromWhatsApp()` → Fetch PDF from WhatsApp CDN
- `saveTempFile()` → Write to disk temporarily
- `cleanupTempFile()` → Delete after processing

### `utils/helpers.js`
- Date/subscription logic
- Phone number formatting
- Quiz ID generation

---

## Deployment to Render.com

### Step 1: Prepare GitHub Repo
```bash
git init
git add .
git commit -m "Initial commit: WhatsApp Quiz Bot"
git remote add origin https://github.com/YOUR-USERNAME/whatsapp-quiz-bot.git
git push -u origin main
```

### Step 2: Deploy on Render
1. Go to [render.com](https://render.com)
2. Sign up with GitHub → authorize
3. Click **+ New** → **Web Service**
4. Select your `whatsapp-quiz-bot` repo
5. Configure:
   - **Name:** `lecturequizbot`
   - **Environment:** `Node`
   - **Region:** Choose nearest
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (note: Render spins down free tier after 15 min inactivity — upgrade to paid for always-on)

### Step 3: Add Environment Variables
In Render dashboard → Your service → **Environment**:
```
WHATSAPP_ACCESS_TOKEN=EAABs...
WHATSAPP_PHONE_NUMBER_ID=123456789
WEBHOOK_VERIFY_TOKEN=my_secure_token_12345
GEMINI_API_KEY=AIzaS...
FIREBASE_PROJECT_ID=lecturequizbot
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
NODE_ENV=production
PORT=3000
QUIZ_QUESTION_COUNT=8
SUBSCRIPTION_TRIAL_DAYS=7
```

**Important:** Paste serviceAccountKey.json contents as an environment variable:
```
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Then update `index.js` to use it:
```javascript
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
```

### Step 4: Get Deployed URL
- Render provides URL: `https://lecturequizbot.onrender.com`
- Copy this → Meta Developer Dashboard

### Step 5: Configure WebhookURL in Meta
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Your App → WhatsApp → **Configuration**
3. **Webhook URL:** `https://lecturequizbot.onrender.com/webhook`
4. **Verify Token:** `my_secure_token_12345` (must match .env)
5. **Subscribe to Webhooks:** `messages`, `message_template_status_update`
6. Click **Verify and Save**

---

## Testing Flow (Step-by-Step from User)

### Pre-Test Checklist
- ✅ Render deployment live
- ✅ Webhook URL set in Meta Dashboard
- ✅ Phone number added as test recipient in WhatsApp
- ✅ All environment variables set
- ✅ Firebase Firestore in test mode

### Test Sequence
1. **Open WhatsApp** → Send message to bot number (e.g., "+1234567890")
   ```
   User: "hi"
   Bot: "Welcome to LectureQuiz Bot! 📚 Upload your lecture notes (PDF)..."
   ```

2. **Send PDF** (any valid PDF, e.g., homework, article)
   ```
   User: [Uploads lecture_notes.pdf]
   Bot: "⏳ Processing... (wait 10-15s)"
   Bot: "Question 1/8: [question text]"
        [A] [B] [C] [D] buttons
   ```

3. **Answer Questions**
   ```
   User: [Taps button C]
   Bot: "✅ Correct!"
        "📊 Score: 1/8"
        [Next question...]
   ```

4. **Complete Quiz**
   ```
   User: [Answer remaining 7 questions]
   Bot: "🎉 Quiz Completed!"
        "📊 Final Score: 7/8 (87%)"
        [Retake / Upload New]
   ```

5. **Retake**
   ```
   User: [Taps "Retake Quiz"]
   Bot: [Same quiz again, score resets]
   ```

### Debugging Commands (Terminal)
```bash
# Check logs
curl https://lecturequizbot.onrender.com/health

# Monitor in Render (live logs)
# Dashboard → Your service → Logs

# Firebase: Check Firestore
# Console → lecturequizbot → Firestore → users/quizzes collections
```

---

## Important Notes & Best Practices

### ⚠️ WhatsApp Policy
- ✅ Users opt-in by messaging first
- ✅ No unsolicited marketing
- ✅ Response within 24 hours of user message
- ✅ Use official Cloud API (not web scraping)
- ✅ Keep messages brief and relevant

### 🔒 Security
- **Never commit** `serviceAccountKey.json` or `.env`
- Use **Render's environment variables** (not hard-coded)
- Rotate API keys periodically
- Use **Firestore security rules** in production:
  ```
  match /users/{document=**} {
    allow read, write: if false;  // Restrict access
  }
  ```

### 💾 Scaling Considerations
- **Firestore free tier:** 50k reads/day, 20k writes/day
- **Gemini free tier:** 60 requests/min
- **Render free tier:** Limited resources, spins down after 15 min
- For production: Upgrade Firebase (pay per use) + Render (paid plan)

### 🐛 Debugging Tips
1. **Check server logs:** Render dashboard → Logs
2. **Monitor Firestore:** Open collections → inspect documents
3. **Test Gemini separately:** Use ai.google.dev playground
4. **WhatsApp webhook:** Meta → Settings → Webhooks → View recent requests

### 🚀 Cursor Iteration Tips
- Ask Copilot to **add features** (e.g., "Add payment flow using Stripe")
- Request **UI improvements** (e.g., "Make quiz questions show with context")
- Ask for **analytics** (e.g., "Track most common wrong answers")
- Request **error handling** (e.g., "Add retry logic for Gemini failures")

Example prompt:
> "Add a feature that sends a weekly summary email of quiz scores. Use nodemailer with Gmail SMTP."

---

## Troubleshooting

### Issue: Webhook Verification Fails
**Solution:** Ensure `WEBHOOK_VERIFY_TOKEN` in .env matches exactly what you set in Meta Dashboard.

### Issue: PDF Upload Returns Error
**Solution:** 
- Check file size (Gemini limit ~10MB)
- Ensure GEMINI_API_KEY is valid
- Test at ai.google.dev first

### Issue: Firestore Writes Blocked
**Solution:** Firebase in "test mode" expires after 30 days. Switch to **"production"** mode with proper security rules.

### Issue: Bot Doesn't Respond
**Solution:**
1. Check `/health` endpoint
2. Verify webhook logs in Meta Dashboard
3. Ensure phone number is test number in WhatsApp
4. Check Render logs for errors

### Issue: "Quiz Completed" but Buttons Don't Work
**Solution:** Button payloads must exactly match code (e.g., "A", "B", "C", "D").

---

## Next Steps / Extensions

### 🎯 Future Enhancements
- [ ] **Payment Integration** (Stripe/Razorpay)
- [ ] **User Dashboard** (web app to view scores)
- [ ] **Spaced Repetition** (SRS algorithm)
- [ ] **Topic Filtering** (quiz on specific chapters)
- [ ] **PDF Outline** (let users select chapters)
- [ ] **Leaderboard** (top scorers)
- [ ] **Study Groups** (share quizzes)
- [ ] **Mobile App** (native iOS/Android)
- [ ] **Analytics Dashboard** (admin panel)
- [ ] **Multi-language** (auto-translate PDFs)

---

## Support

For issues:
1. Check logs: Render → Logs
2. Test API key: ai.google.dev
3. Debug Firestore: Firebase Console
4. Review WhatsApp docs: [developers.facebook.com/whatsapp](https://developers.facebook.com/whatsapp)

---

**Version:** 1.0.0  
**Last Updated:** March 31, 2026  
**License:** ISC
# wabot

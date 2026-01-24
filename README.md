# HAWK

A personalized, AI-powered learning platform that generates comprehensive study materials, interactive exercises, and professional interview practice using advanced LLM technology.

## Features

### 🎓 Core Learning Platform
- **🔐 Access Control**: Gated access with access code system
- **👤 Google OAuth Login**: Secure authentication with Google accounts
- **💾 Cloud Sync**: Save and sync lectures across devices
- **📱 Mobile Responsive**: Fully optimized for mobile devices
- **🎯 Knowledge Assessment**: "Tinder-style" assessment to personalize content based on your existing knowledge
- **Dynamic Study Plans**: Generate complete lecture roadmaps based on your learning goals
- **🎨 Smart Content Generation**: Format-specific LLM prompts for better quality (processes, frameworks, concepts, comparisons)
- **✨ Personalized Learning**: Subtle indicators show content adapted to your knowledge level
- **Interactive Practice Exercises**: On-demand exercise generation with LLM-powered evaluation and feedback
- **🧠 Comprehensive Testing**: Full chapter tests with detailed scenarios and performance analytics
- **Progress Tracking**: All chapters unlocked with completion tracking

### 🎤 Interview Practice (NEW!)
- **AI-Powered Case Interviews**: Practice professional consulting interviews with voice interaction
- **Real McKinsey-Style Cases**: Complete with the "Beautify" cosmetics case study
- **Voice Recognition**: Record your answers with automatic transcription
- **Dynamic Follow-ups**: AI generates contextual follow-up questions based on your responses
- **Quantitative Analysis**: Math problems with step-by-step evaluation
- **Professional Flow**: Introduction → Qualitative questions → Math analysis → Closing
- **Performance Feedback**: Detailed analysis of your interview performance

## Tech Stack

### Main Platform
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js (Node.js)
- **Database**: MongoDB
- **Authentication**: Passport.js with Google OAuth 2.0
- **AI**: OpenAI API (GPT-4o-mini)
- **Styling**: CSS3 with modern, mobile-responsive design

### Interview Practice Service
- **Backend**: FastAPI (Python)
- **Voice Processing**: OpenAI Whisper (speech-to-text)
- **AI Questions**: OpenAI GPT-4o-mini
- **Text-to-Speech**: ElevenLabs
- **Audio Format**: WebM recording with MP3 playback

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env` file in the root directory:
   ```
   # OpenAI API
   OPENAI_API_KEY=your-api-key-here
   
   # Server Configuration
   PORT=8787
   VITE_API_BASE_URL=http://localhost:8787
   API_BASE_URL=http://localhost:8787
   FRONTEND_URL=http://localhost:5173
   
   # Database (MongoDB)
   MONGODB_URI=mongodb://localhost:27017/studyhub
   # Or use MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/studyhub
   
   # Session Secret (generate a random string)
   SESSION_SECRET=your-random-secret-key-here
   
   # Access Code (users need this to access the app)
   ACCESS_CODE=STUDYHUB2024
   
   # Google OAuth (get from https://console.cloud.google.com/)
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_CALLBACK_URL=http://localhost:8787/api/auth/google/callback
   ```

3. **Set up Google OAuth**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Google+ API
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:8787/api/auth/google/callback` (or your production URL)
   - Copy the Client ID and Client Secret to your `.env` file

4. **Set up MongoDB** (if not using MongoDB Atlas):
   - Install MongoDB locally, or
   - Use MongoDB Atlas (free tier available): https://www.mongodb.com/cloud/atlas

5. **Start the development servers**:
   
   Terminal 1 (Backend API):
   ```bash
   npm run dev:api
   ```
   
   Terminal 2 (Frontend):
   ```bash
   npm run dev
   ```

6. **Open your browser**:
   Navigate to the URL shown in the frontend terminal (usually `http://localhost:5173`)

### 🎤 Interview Practice Setup (Optional)

To enable the AI-powered interview practice feature:

7. **Set up Interview Practice Service**:
   
   **Additional Environment Variables** (add to your `.env` file):
   ```bash
   # ElevenLabs API (for text-to-speech)
   ELEVENLABS_API_KEY=your-elevenlabs-api-key
   ```

8. **Install Python Dependencies**:
   ```bash
   # Automatic setup (recommended)
   npm run setup:interview
   
   # OR manual setup
   cd interviewer
   pip3 install -r requirements.txt
   ```

9. **Start the Interview Service** (in a third terminal):
   ```bash
   npm run dev:interview
   ```
   
   The interview service will run on `http://localhost:8001`

10. **Interview Practice Usage**:
    - Navigate to any lecture in HAWK
    - Go to the final "Interview Practice" chapter
    - Click "Case Study Interview Simulation"
    - Allow microphone permissions when prompted
    - Practice with the Beautify case study!

**Requirements for Interview Practice**:
- Python 3.8 or higher
- OpenAI API key (for GPT-4o-mini + Whisper)
- ElevenLabs API key (for text-to-speech)
- Microphone access in browser
- Modern browser with audio support

## Project Structure

```
HAWK/
├── server/
│   └── index.js                    # Express API server with OpenAI integration
├── src/
│   ├── App.tsx                     # Main application component
│   ├── App.css                     # Application styles
│   ├── api.ts                      # API client functions
│   ├── types.ts                    # TypeScript type definitions
│   └── components/
│       ├── ChapterTest.tsx         # Comprehensive chapter testing
│       ├── InterviewPractice.tsx   # Interview practice interface
│       └── ...                     # Other React components
├── interviewer/                    # Interview Practice Service (Python)
│   ├── server.py                   # FastAPI backend for interviews
│   ├── requirements.txt            # Python dependencies
│   ├── transcripts/                # Interview session transcripts
│   └── README.md                   # Interview service documentation
├── scripts/
│   ├── setup-interview-service.sh  # Interview setup script (Unix)
│   └── setup-interview-service.bat # Interview setup script (Windows)
├── .env                            # Environment variables (not committed)
└── package.json                    # Dependencies and scripts
```

## How It Works

1. **Access Code**: Enter the access code to enter the app
2. **Login**: Sign in with your Google account
3. **Create a Lecture**: Enter a topic and learning goal
4. **Generate Plan**: LLM creates a structured study plan with chapters and subchapters
5. **Learn**: Each subchapter includes:
   - Introduction
   - Categorized learning materials (processes, frameworks, etc.)
   - Interactive practice exercises with LLM evaluation
6. **Quiz**: Final quiz section tests overall understanding
7. **Progress**: Complete subchapters to unlock next chapters
8. **Auto-Save**: Your progress is automatically saved and synced across devices

## API Endpoints

### Authentication
- `POST /api/verify-access-code` - Verify access code
- `GET /api/auth/google` - Initiate Google OAuth login
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user info

### Lectures
- `POST /api/lectures/save` - Save/update a lecture (requires auth)
- `GET /api/lectures` - Load all user lectures (requires auth)
- `DELETE /api/lectures/:lectureId` - Delete a lecture (requires auth)

### Content Generation
- `POST /api/plan` - Generate study plan
- `POST /api/learning-sections` - Generate learning sections
- `POST /api/learning-sections-enhancement` - Categorize and format sections
- `POST /api/practice-exercise-refine` - Refine practice exercises
- `POST /api/practice-exercise-evaluate` - Evaluate practice answers
- `POST /api/exercises` - Generate quiz exercises
- `POST /api/evaluate` - Evaluate quiz answers

## Security Note

⚠️ **Important**: Never commit your `.env` file or API keys to version control. The `.env` file is already in `.gitignore`.

## License

MIT

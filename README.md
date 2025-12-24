# StudyHub

A personalized, adaptable study platform that generates comprehensive learning materials and interactive exercises using LLM-powered content generation.

## Features

- **🔐 Access Control**: Gated access with access code system
- **👤 Google OAuth Login**: Secure authentication with Google accounts
- **💾 Cloud Sync**: Save and sync lectures across devices
- **📱 Mobile Responsive**: Fully optimized for mobile devices
- **Dynamic Study Plans**: Generate complete lecture roadmaps based on your learning goals
- **Adaptive Learning Materials**: LLM categorizes and formats content optimally (processes, frameworks, definitions, concepts, comparisons)
- **Interactive Practice Exercises**: Embedded exercises with LLM-powered evaluation and feedback
- **Structured Learning**: Introduction → Learning Materials → Practice → Quiz flow
- **Progress Tracking**: Chapter and subchapter completion tracking with unlock system

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js
- **Database**: MongoDB
- **Authentication**: Passport.js with Google OAuth 2.0
- **AI**: OpenAI API (GPT-4o-mini)
- **Styling**: CSS3 with modern, mobile-responsive design

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

## Project Structure

```
StudyHub/
├── server/
│   └── index.js          # Express API server with OpenAI integration
├── src/
│   ├── App.tsx           # Main application component
│   ├── App.css           # Application styles
│   ├── api.ts            # API client functions
│   ├── types.ts          # TypeScript type definitions
│   └── ...
├── .env                  # Environment variables (not committed)
└── package.json         # Dependencies and scripts
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

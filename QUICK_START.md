# Quick Start Guide

## 🚀 Fastest Path to Running StudyHub

### Step 1: Choose Your Database Option

**Option A: MongoDB Atlas (Easiest - 5 minutes)**
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Sign up (free)
3. Create a cluster (free M0 tier)
4. Click "Connect" → "Connect your application"
5. Copy the connection string
6. Replace `<password>` with your database password

**Option B: Local MongoDB**
```bash
# Install MongoDB (macOS)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

### Step 2: Set Up Google OAuth (5 minutes)

1. Go to https://console.cloud.google.com/
2. Create/select a project
3. Go to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure OAuth consent screen (if first time):
   - User Type: External
   - App name: StudyHub
   - Your email
6. Create OAuth Client:
   - Type: Web application
   - Authorized redirect URI: `http://localhost:8787/api/auth/google/callback`
7. Copy Client ID and Client Secret

### Step 3: Update Your .env File

I've generated a session secret for you: `i0eWycWgS9cObRgzUHQs6uyrU+EI4O+HsiBhfKCY3Xk=`

Add this to your `.env` file along with:

```env
# Your existing OpenAI key
OPENAI_API_KEY=sk-proj-...

# Server
PORT=8787
VITE_API_BASE_URL=http://localhost:8787
API_BASE_URL=http://localhost:8787
FRONTEND_URL=http://localhost:5173

# Database (choose one)
# MongoDB Atlas:
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/studyhub
# OR Local:
# MONGODB_URI=mongodb://localhost:27017/studyhub

# Session Secret (use the one generated above)
SESSION_SECRET=i0eWycWgS9cObRgzUHQs6uyrU+EI4O+HsiBhfKCY3Xk=

# Access Code
ACCESS_CODE=STUDYHUB2024

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8787/api/auth/google/callback
```

### Step 4: Test It!

```bash
# Terminal 1 - Backend
npm run dev:api

# Terminal 2 - Frontend  
npm run dev
```

Then open http://localhost:5173 and:
1. Enter access code: `STUDYHUB2024`
2. Sign in with Google
3. Create a lecture!

## ✅ Checklist

- [ ] MongoDB set up (Atlas or local)
- [ ] Google OAuth credentials created
- [ ] `.env` file updated with all variables
- [ ] Backend starts without errors
- [ ] Frontend loads
- [ ] Can log in with Google
- [ ] Can create and save lectures

## 🆘 Need Help?

See `SETUP.md` for detailed instructions and troubleshooting.


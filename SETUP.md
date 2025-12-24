# StudyHub Setup Guide

Follow these steps to get your StudyHub application running with authentication and database.

## Step 1: MongoDB Setup

### Option A: MongoDB Atlas (Recommended - Cloud, Free Tier Available)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Sign up for a free account
3. Create a new cluster (choose the free M0 tier)
4. Create a database user:
   - Go to "Database Access" → "Add New Database User"
   - Choose "Password" authentication
   - Create a username and password (save these!)
5. Whitelist your IP:
   - Go to "Network Access" → "Add IP Address"
   - Click "Allow Access from Anywhere" (for development) or add your IP
6. Get your connection string:
   - Go to "Database" → "Connect" → "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Example: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/studyhub?retryWrites=true&w=majority`

### Option B: Local MongoDB

1. Install MongoDB locally:
   ```bash
   # macOS (using Homebrew)
   brew tap mongodb/brew
   brew install mongodb-community
   brew services start mongodb-community
   ```
2. Connection string: `mongodb://localhost:27017/studyhub`

## Step 2: Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable Google+ API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - If prompted, configure the OAuth consent screen first:
     - User Type: External
     - App name: StudyHub
     - User support email: your email
     - Developer contact: your email
     - Save and continue through the steps
   - Application type: Web application
   - Name: StudyHub
   - Authorized JavaScript origins:
     - `http://localhost:8787` (for development)
     - Add your production URL when deploying
   - Authorized redirect URIs:
     - `http://localhost:8787/api/auth/google/callback` (for development)
     - Add your production callback URL when deploying
   - Click "Create"
5. Copy your Client ID and Client Secret

## Step 3: Environment Variables

Update your `.env` file with the following:

```env
# OpenAI API
OPENAI_API_KEY=your-openai-api-key-here

# Server Configuration
PORT=8787
VITE_API_BASE_URL=http://localhost:8787
API_BASE_URL=http://localhost:8787
FRONTEND_URL=http://localhost:5173

# Database (MongoDB)
# For MongoDB Atlas:
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/studyhub?retryWrites=true&w=majority
# For Local MongoDB:
# MONGODB_URI=mongodb://localhost:27017/studyhub

# Session Secret (generate a random string)
# You can generate one with: openssl rand -base64 32
SESSION_SECRET=your-random-secret-key-here-change-this-in-production

# Access Code (users need this to access the app)
ACCESS_CODE=STUDYHUB2024

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8787/api/auth/google/callback
```

## Step 4: Generate Session Secret

Run this command to generate a secure session secret:

```bash
openssl rand -base64 32
```

Copy the output and paste it as your `SESSION_SECRET` in `.env`.

## Step 5: Test the Setup

1. **Start MongoDB** (if using local):
   ```bash
   brew services start mongodb-community
   ```

2. **Start the backend**:
   ```bash
   npm run dev:api
   ```
   You should see: `✅ Connected to MongoDB` and `StudyHub API listening on http://localhost:8787`

3. **Start the frontend** (in a new terminal):
   ```bash
   npm run dev
   ```

4. **Test the flow**:
   - Open `http://localhost:5173`
   - Enter your access code (default: `STUDYHUB2024`)
   - Click "Sign in with Google"
   - Complete OAuth flow
   - Create a lecture and verify it saves

## Troubleshooting

### MongoDB Connection Issues
- Check your connection string is correct
- Verify your IP is whitelisted (for Atlas)
- Check MongoDB is running (for local)

### Google OAuth Issues
- Verify redirect URI matches exactly (including http/https)
- Check Client ID and Secret are correct
- Ensure Google+ API is enabled

### Session Issues
- Make sure `SESSION_SECRET` is set
- Clear browser cookies if having login issues

## Production Deployment

When deploying to production:

1. Update `FRONTEND_URL` and `GOOGLE_CALLBACK_URL` to your production URLs
2. Use a strong, unique `SESSION_SECRET`
3. Use a secure `ACCESS_CODE`
4. Enable HTTPS
5. Update Google OAuth redirect URIs in Google Cloud Console


# Google OAuth Setup Guide

Follow these steps to set up Google OAuth for StudyHub authentication.

## Step-by-Step Instructions

### Step 1: Go to Google Cloud Console

1. Open your browser and go to: **https://console.cloud.google.com/**
2. Sign in with your Google account

### Step 2: Create or Select a Project

1. Click the project dropdown at the top (next to "Google Cloud")
2. Either:
   - **Select an existing project**, OR
   - **Click "New Project"** → Enter name: "StudyHub" → Click "Create"

### Step 3: Configure OAuth Consent Screen

1. In the left sidebar, go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** (unless you have a Google Workspace account)
3. Click **"Create"**
4. Fill in the required fields:
   - **App name**: `StudyHub`
   - **User support email**: Select your email
   - **Developer contact information**: Enter your email
5. Click **"Save and Continue"**
6. On the "Scopes" page, click **"Save and Continue"** (no need to add scopes)
7. On the "Test users" page, click **"Save and Continue"** (for development, you can add your email later if needed)
8. Review and click **"Back to Dashboard"**

### Step 4: Create OAuth 2.0 Credentials

1. In the left sidebar, go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**
4. If prompted about the consent screen, click **"Configure consent screen"** and complete Step 3 above first
5. In the "Create OAuth client ID" form:
   - **Application type**: Select **"Web application"**
   - **Name**: `StudyHub` (or any name you prefer)
   - **Authorized JavaScript origins**: Click **"+ ADD URI"** and add:
     - `http://localhost:8787`
   - **Authorized redirect URIs**: Click **"+ ADD URI"** and add:
     - `http://localhost:8787/api/auth/google/callback`
6. Click **"CREATE"**
7. **IMPORTANT**: A popup will appear with your credentials:
   - **Your Client ID**: Copy this (looks like: `123456789-abcdefg.apps.googleusercontent.com`)
   - **Your Client Secret**: Copy this (looks like: `GOCSPX-abcdefghijklmnopqrstuvwxyz`)
   - ⚠️ **Save these immediately** - you won't be able to see the secret again!

### Step 5: Add Credentials to Your .env File

Open your `.env` file and add:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_CALLBACK_URL=http://localhost:8787/api/auth/google/callback
```

Replace `your-client-id-here` and `your-client-secret-here` with the values you copied.

### Step 6: Verify Setup

Run the validation script:

```bash
npm run validate
```

You should see ✅ for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Troubleshooting

### "Redirect URI mismatch" Error

- Make sure the redirect URI in Google Console **exactly matches**:
  - `http://localhost:8787/api/auth/google/callback`
- Check for typos, extra spaces, or missing `http://`
- Make sure you're using `http://` not `https://` for local development

### "Access blocked" Error

- Go to "OAuth consent screen" in Google Console
- Make sure the app is published or add your email as a test user
- For development, you can add test users in "OAuth consent screen" → "Test users"

### Can't Find Credentials Later

- Go to "APIs & Services" → "Credentials"
- Find your OAuth 2.0 Client ID
- Click the edit icon (pencil) to view details
- Note: The Client Secret is only shown once when created. If you lost it, you'll need to create new credentials.

## Production Setup

When deploying to production:

1. Update the redirect URI in Google Console to your production URL:
   - `https://yourdomain.com/api/auth/google/callback`
2. Update `GOOGLE_CALLBACK_URL` in your production `.env`
3. Add your production domain to "Authorized JavaScript origins"

## Quick Checklist

- [ ] Created/selected Google Cloud project
- [ ] Configured OAuth consent screen
- [ ] Created OAuth 2.0 Client ID
- [ ] Copied Client ID and Client Secret
- [ ] Added credentials to `.env` file
- [ ] Verified with `npm run validate`
- [ ] Tested login flow

## Next Steps

Once OAuth is set up:

1. Run `npm run validate` to check all configuration
2. Start the backend: `npm run dev:api`
3. Start the frontend: `npm run dev`
4. Test the login flow!


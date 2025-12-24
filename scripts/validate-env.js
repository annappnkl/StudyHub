#!/usr/bin/env node

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const envPath = join(rootDir, '.env')

console.log('🔍 Validating StudyHub Environment Configuration...\n')

// Check if .env exists
if (!existsSync(envPath)) {
  console.error('❌ .env file not found!')
  console.log('💡 Create a .env file in the root directory.')
  process.exit(1)
}

// Read .env file
let envContent
try {
  envContent = readFileSync(envPath, 'utf-8')
} catch (err) {
  console.error('❌ Failed to read .env file:', err.message)
  process.exit(1)
}

// Parse .env file
const envVars = {}
const requiredVars = []
const optionalVars = []

envContent.split('\n').forEach((line) => {
  line = line.trim()
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim()
      envVars[key.trim()] = value
    }
  }
})

// Define required variables with defaults
const required = {
  OPENAI_API_KEY: 'OpenAI API key for content generation',
  PORT: 'Server port (default: 8787)',
  VITE_API_BASE_URL: 'Frontend API base URL (default: http://localhost:8787)',
  API_BASE_URL: 'Backend API base URL (default: http://localhost:8787)',
  FRONTEND_URL: 'Frontend URL for CORS (default: http://localhost:5173)',
  MONGODB_URI: 'MongoDB connection string (default: mongodb://localhost:27017/studyhub)',
  SESSION_SECRET: 'Session encryption secret',
  ACCESS_CODE: 'Access code for app entry (default: STUDYHUB2024)',
  GOOGLE_CLIENT_ID: 'Google OAuth Client ID',
  GOOGLE_CLIENT_SECRET: 'Google OAuth Client Secret',
  GOOGLE_CALLBACK_URL: 'Google OAuth callback URL (default: http://localhost:8787/api/auth/google/callback)',
}

// Default values (used if not set)
const defaults = {
  PORT: '8787',
  VITE_API_BASE_URL: 'http://localhost:8787',
  API_BASE_URL: 'http://localhost:8787',
  FRONTEND_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost:27017/studyhub',
  ACCESS_CODE: 'STUDYHUB2024',
  GOOGLE_CALLBACK_URL: 'http://localhost:8787/api/auth/google/callback',
}

// Validate each variable
let hasErrors = false
let hasWarnings = false

console.log('📋 Checking required variables:\n')

Object.entries(required).forEach(([key, description]) => {
  let value = envVars[key]
  // Use default if not set and default exists
  if (!value && defaults[key]) {
    value = defaults[key]
  }
  
  const isEmpty = !value || value === '' || value.includes('your-') || value.includes('CHANGE-THIS')

  if (isEmpty) {
    // Some variables have defaults, so they're warnings not errors
    if (defaults[key]) {
      console.warn(`⚠️  ${key}`)
      console.warn(`   Using default: ${defaults[key]}`)
      console.warn(`   ${description}`)
      hasWarnings = true
    } else {
      console.error(`❌ ${key}`)
      console.error(`   Missing or not configured: ${description}`)
      hasErrors = true
    }
  } else {
    // Additional validation
    if (key === 'OPENAI_API_KEY' && !value.startsWith('sk-')) {
      console.warn(`⚠️  ${key}`)
      console.warn(`   Warning: API key should start with 'sk-'`)
      hasWarnings = true
    } else if (key === 'MONGODB_URI' && !value.startsWith('mongodb://') && !value.startsWith('mongodb+srv://')) {
      console.warn(`⚠️  ${key}`)
      console.warn(`   Warning: Should start with 'mongodb://' or 'mongodb+srv://'`)
      hasWarnings = true
    } else if (key === 'SESSION_SECRET' && value.length < 32) {
      console.warn(`⚠️  ${key}`)
      console.warn(`   Warning: Should be at least 32 characters for security`)
      hasWarnings = true
    } else if (key === 'GOOGLE_CLIENT_ID' && !value.includes('.apps.googleusercontent.com')) {
      console.warn(`⚠️  ${key}`)
      console.warn(`   Warning: Should be a valid Google Client ID`)
      hasWarnings = true
    } else {
      // Mask sensitive values
      const displayValue =
        key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD')
          ? '•'.repeat(Math.min(value.length, 20))
          : value
      console.log(`✅ ${key} = ${displayValue}`)
    }
  }
})

console.log('\n' + '='.repeat(60) + '\n')

// Check MongoDB connection
const mongoUri = envVars.MONGODB_URI || defaults.MONGODB_URI
if (mongoUri && !hasErrors) {
  console.log('🔌 Testing MongoDB connection...')
  try {
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(mongoUri)
    await client.connect()
    await client.db().admin().ping()
    console.log('✅ MongoDB connection successful!\n')
    await client.close()
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message)
    console.log('💡 Make sure MongoDB is running and the connection string is correct.\n')
    hasWarnings = true
  }
}

// Summary
if (hasErrors) {
  console.log('❌ Validation failed! Please fix the errors above.')
  console.log('💡 See SETUP.md or QUICK_START.md for help.\n')
  process.exit(1)
} else if (hasWarnings) {
  console.log('⚠️  Validation passed with warnings. Review the warnings above.\n')
  process.exit(0)
} else {
  console.log('✅ All environment variables are configured correctly!')
  console.log('🚀 You\'re ready to start the application!\n')
  process.exit(0)
}


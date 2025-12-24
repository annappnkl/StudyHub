import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import OpenAI from 'openai'
import { ObjectId } from 'mongodb'
import { connectDB, getDB } from './db.js'
import cookieParser from 'cookie-parser'
import { sign } from 'cookie-signature'

dotenv.config()

const app = express()

// CORS configuration
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

// Session configuration with MongoDB store (required for serverless/Vercel)
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/studyhub'

// Create MongoDB session store with error handling and connection options
let mongoStore
try {
  mongoStore = MongoStore.create({
    mongoUrl: MONGODB_URI,
    dbName: 'studyhub',
    collectionName: 'sessions',
    ttl: 30 * 24 * 60 * 60, // 30 days in seconds
    autoRemove: 'native',
    touchAfter: 24 * 3600, // Lazy session update
    stringify: false,
    // Connection options for serverless
    clientOptions: {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000,
      connectTimeoutMS: 5000,
      maxPoolSize: 1, // Limit connections for serverless
    },
  })
  
  // Handle store errors gracefully
  mongoStore.on('error', (error) => {
    console.error('MongoDB session store error:', error)
  })
  
  mongoStore.on('connected', () => {
    console.log('MongoDB session store connected')
  })
  
  mongoStore.on('disconnected', () => {
    console.log('MongoDB session store disconnected')
  })
} catch (err) {
  console.error('Failed to create MongoDB session store:', err)
  console.warn('Falling back to memory store - sessions will not persist across serverless invocations')
  // Will fall back to memory store if this fails
}

const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'studyhub-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: mongoStore, // Will be undefined if creation failed, falls back to memory
  name: 'connect.sid', // Explicit session cookie name
  cookie: {
    secure: isProduction, // HTTPS only in production
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: isProduction ? 'none' : 'lax', // Required for cross-origin in production
    path: '/', // Ensure cookie is available for all paths
  },
}

console.log('Session config:', {
  store: mongoStore ? 'MongoDB' : 'Memory (fallback)',
  secure: sessionConfig.cookie.secure,
  sameSite: sessionConfig.cookie.sameSite,
  httpOnly: sessionConfig.cookie.httpOnly,
})

app.use(session(sessionConfig))

app.use(passport.initialize())
app.use(passport.session())

// Access code (set in environment variable)
const ACCESS_CODE = process.env.ACCESS_CODE || 'STUDYHUB2024'

// Google OAuth configuration
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        `${process.env.API_BASE_URL || 'http://localhost:8787'}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google OAuth profile received:', {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
        })
        
        const db = await getDB()
        if (!db) {
          throw new Error('Database connection not available')
        }
        
        const usersCollection = db.collection('users')

        let user = await usersCollection.findOne({ googleId: profile.id })

        if (!user) {
          // Create new user
          const newUser = {
            googleId: profile.id,
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName || '',
            picture: profile.photos?.[0]?.value || '',
            createdAt: new Date(),
            lectures: [],
          }
          const result = await usersCollection.insertOne(newUser)
          user = { ...newUser, _id: result.insertedId }
          console.log('New user created:', user._id)
        } else {
          // Update user info
          await usersCollection.updateOne(
            { googleId: profile.id },
            {
              $set: {
                name: profile.displayName || user.name,
                picture: profile.photos?.[0]?.value || user.picture,
                lastLogin: new Date(),
              },
            },
          )
          console.log('User updated:', user._id)
        }

        return done(null, user)
      } catch (err) {
        console.error('Error in Google OAuth strategy:', err)
        return done(err, null)
      }
    },
  ),
)

passport.serializeUser((user, done) => {
  done(null, user._id.toString())
})

passport.deserializeUser(async (id, done) => {
  try {
    const db = await getDB()
    if (!db) {
      throw new Error('Database connection not available')
    }
    const usersCollection = db.collection('users')
    const user = await usersCollection.findOne({ _id: new ObjectId(id) })
    done(null, user)
  } catch (err) {
    console.error('Error deserializing user:', err)
    done(err, null)
  }
})

// Connect to database on startup
connectDB().catch(console.error)

const PORT = process.env.PORT || 8787
const openaiApiKey = process.env.OPENAI_API_KEY

if (!openaiApiKey) {
  console.warn(
    '⚠️ OPENAI_API_KEY not set. Requests to /api/plan will fail until you add it to .env.local',
  )
}

const openai = new OpenAI({ apiKey: openaiApiKey })

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next()
  }
  return res.status(401).json({ error: 'Unauthorized' })
}

// Access code verification endpoint
app.post('/api/verify-access-code', (req, res) => {
  const { code } = req.body
  // Case-insensitive comparison with trimmed whitespace
  const normalizedCode = code?.toString().trim().toUpperCase()
  const normalizedAccessCode = ACCESS_CODE?.toString().trim().toUpperCase()
  
  if (normalizedCode && normalizedAccessCode && normalizedCode === normalizedAccessCode) {
    res.json({ valid: true })
  } else {
    res.status(401).json({ valid: false, error: 'Invalid access code' })
  }
})

// Authentication routes
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

app.get(
  '/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    try {
      console.log('OAuth callback successful, user authenticated:', req.isAuthenticated())
      console.log('OAuth callback - user:', req.user ? req.user.email : 'null')
      console.log('OAuth callback - session ID:', req.sessionID)
      console.log('OAuth callback - session:', req.session ? 'exists' : 'null')
      
      if (!req.isAuthenticated() || !req.user) {
        console.error('User not authenticated after OAuth callback')
        return res.redirect('/login?error=auth_failed')
      }
      
      // Mark session as modified to ensure it's saved
      req.session.touch()
      
      // Save the session and ensure cookie is set
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session:', err)
            return reject(err)
          }
          resolve()
        })
      })
      
      console.log('Session saved successfully, session ID:', req.sessionID)
      
      // Force express-session to set the cookie
      // The issue is that redirects might bypass the session cookie setting
      // We need to ensure the session cookie is in the response headers
      
      // Check if cookie is already set by express-session
      let setCookieHeader = res.getHeader('set-cookie')
      console.log('Cookie header before manual set:', setCookieHeader)
      
      // If cookie is not set, manually add it with proper signing
      if (!setCookieHeader || (Array.isArray(setCookieHeader) && setCookieHeader.length === 0)) {
        const cookieName = req.session.cookie.name || 'connect.sid'
        const sessionSecret = process.env.SESSION_SECRET || 'studyhub-secret-key-change-in-production'
        
        // Sign the session ID the same way express-session does
        const signedValue = 's:' + sign(req.sessionID, sessionSecret)
        
        // Build cookie string matching express-session's format
        const cookieParts = [
          `${cookieName}=${signedValue}`,
          `Path=${req.session.cookie.path || '/'}`,
          `Max-Age=${Math.floor((req.session.cookie.maxAge || 2592000000) / 1000)}`,
        ]
        
        if (req.session.cookie.httpOnly !== false) {
          cookieParts.push('HttpOnly')
        }
        
        if (req.session.cookie.secure) {
          cookieParts.push('Secure')
        }
        
        const sameSite = req.session.cookie.sameSite || 'None'
        cookieParts.push(`SameSite=${sameSite}`)
        
        const cookieString = cookieParts.join('; ')
        res.setHeader('Set-Cookie', cookieString)
        
        console.log('Manually set signed cookie:', cookieString.substring(0, 100) + '...')
      }
      
      console.log('Response headers after ensuring cookie:', {
        'set-cookie': res.getHeader('set-cookie'),
      })
      
      // Redirect to frontend after successful login
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
      console.log('Redirecting to:', frontendUrl)
      res.redirect(frontendUrl)
    } catch (err) {
      console.error('Error in OAuth callback redirect:', err)
      res.status(500).json({ error: 'Authentication successful but redirect failed' })
    }
  },
)

app.get('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' })
    }
    res.json({ success: true })
  })
})

app.get('/api/auth/me', (req, res) => {
  console.log('Auth check - isAuthenticated:', req.isAuthenticated())
  console.log('Auth check - user:', req.user ? 'exists' : 'null')
  console.log('Auth check - session:', req.session ? 'exists' : 'null')
  console.log('Auth check - session ID:', req.sessionID)
  console.log('Auth check - cookies:', req.headers.cookie ? 'present' : 'missing')
  console.log('Auth check - headers:', {
    origin: req.headers.origin,
    referer: req.headers.referer,
    cookie: req.headers.cookie ? 'present' : 'missing',
  })
  
  if (req.isAuthenticated()) {
    const { _id, googleId, email, name, picture } = req.user
    res.json({
      authenticated: true,
      user: {
        id: _id.toString(),
        email,
        name,
        picture,
      },
    })
  } else {
    res.json({ authenticated: false })
  }
})

// Save lecture endpoint
app.post('/api/lectures/save', requireAuth, async (req, res) => {
  try {
    const { lecture } = req.body
    const db = await getDB()
    const usersCollection = db.collection('users')

    const user = await usersCollection.findOne({ _id: req.user._id })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Update or add lecture
    const lectures = user.lectures || []
    const existingIndex = lectures.findIndex((l) => l.id === lecture.id)

    if (existingIndex >= 0) {
      lectures[existingIndex] = { ...lecture, updatedAt: new Date() }
    } else {
      lectures.push({ ...lecture, createdAt: new Date(), updatedAt: new Date() })
    }

    await usersCollection.updateOne(
      { _id: req.user._id },
      { $set: { lectures, lastActivity: new Date() } },
    )

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save lecture' })
  }
})

// Load lectures endpoint
app.get('/api/lectures', requireAuth, async (req, res) => {
  try {
    const db = await getDB()
    const usersCollection = db.collection('users')

    const user = await usersCollection.findOne({ _id: req.user._id })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ lectures: user.lectures || [] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load lectures' })
  }
})

// Delete lecture endpoint
app.delete('/api/lectures/:lectureId', requireAuth, async (req, res) => {
  try {
    const { lectureId } = req.params
    const db = await getDB()
    const usersCollection = db.collection('users')

    const user = await usersCollection.findOne({ _id: req.user._id })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const lectures = (user.lectures || []).filter((l) => l.id !== lectureId)

    await usersCollection.updateOne(
      { _id: req.user._id },
      { $set: { lectures, lastActivity: new Date() } },
    )

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete lecture' })
  }
})

app.post('/api/plan', async (req, res) => {
  const { topic, goal, materialsSummary } = req.body || {}

  if (!topic || !goal) {
    return res.status(400).json({ error: 'topic and goal are required' })
  }

  try {
    const system =
      'You are an expert instructional designer. Produce a comprehensive, thorough study plan that fully covers the topic. Generate as many chapters and subchapters as needed to achieve the learning goal—do not limit yourself to a fixed number.'
    const user = `
Create a structured lecture plan that COMPLETELY covers the topic to achieve the goal.
- Topic: ${topic}
- Goal: ${goal}
- Materials summary (optional): ${materialsSummary || 'N/A'}

CRITICAL REQUIREMENTS:
- Generate AS MANY chapters as needed to fully cover all aspects of the topic
- Each chapter should have AS MANY subchapters as needed to thoroughly teach that chapter's content
- Do NOT limit yourself to 2 subchapters per chapter or any fixed number
- Break down the topic comprehensively—if a topic requires 5 chapters with 4-6 subchapters each, generate that
- Each subchapter should focus on ONE specific concept, method, or aspect
- The total structure should be sufficient to take a learner from beginner to achieving the stated goal

Return JSON with:
{
  "lectureTitle": "string",
  "chapters": [
    {
      "id": "string (unique)",
      "title": "string",
      "subchapters": [
        {
          "id": "string (unique)",
          "title": "string (specific, focused topic)",
          "content": "5-8 sentences that thoroughly teach the subchapter. Include key definitions, core ideas, common pitfalls, and at least one short example or scenario that directly supports the goal."
        }
      ]
    }
  ]
}

Generate a comprehensive plan—use as many chapters and subchapters as necessary to fully cover the topic.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content from OpenAI')
    }

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate plan' })
  }
})

app.post('/api/exercises', async (req, res) => {
  const { lectureTitle, chapterTitle, subchapterTitle, subchapterContent, goal, learningSections } =
    req.body || {}

  if (!lectureTitle || !chapterTitle || !subchapterTitle || !subchapterContent || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert tutor. Generate creative, application-based practice questions that test deep understanding.'
    const learningSectionsText = learningSections && Array.isArray(learningSections) && learningSections.length > 0
      ? '\n\nDetailed Learning Materials:\n' + learningSections.map((ls, idx) => `${idx + 1}. ${ls.title}\n${ls.content}`).join('\n\n')
      : ''
    
    const user = `
Lecture: ${lectureTitle}
Chapter: ${chapterTitle}
Subchapter: ${subchapterTitle}
Goal: ${goal}
Introduction:
${subchapterContent}
${learningSectionsText}

Return JSON array "exercises" with 2-4 items. Each item:
{
  "id": "string",
  "type": "open-ended" | "mcq",
  "prompt": "string",
  "options": [{"id": "a"|"b"|"c"|"d", "text": "string", "isCorrect": boolean}] (for mcq only),
  "solutionExplanation": "short explanation"
}

CRITICAL REQUIREMENTS:
- Open-ended questions MUST be creative and application-based. Examples:
  * "Conduct a SWOT analysis for [specific scenario with details]"
  * "Apply [method/concept] to solve [real-world problem]"
  * "Design a [solution] using [concept] for [scenario]"
  * NOT shallow questions like "What is X?" or "Define Y"
- MCQ questions should test understanding of concepts, not just definitions.
- Ensure at least 1 open-ended and 1 mcq.
- All questions must be answerable from the learning materials provided above.
- Questions should require applying knowledge, not just recalling facts.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    const exercises = parsed.exercises || parsed

    return res.json(exercises)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate exercises' })
  }
})

// New combined endpoint - replaces learning-sections and learning-sections-enhancement
app.post('/api/learning-sections-enhanced', async (req, res) => {
  const { subchapterContent, goal, subchapterTitle } = req.body || {}

  if (!subchapterContent || !goal || !subchapterTitle) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert instructional designer. Create accurate, factual learning sections with appropriate formatting. Focus on accuracy over creativity.'
    const user = `
Subchapter Title: ${subchapterTitle}
Goal: ${goal}
Introduction/Overview:
${subchapterContent}

Analyze the introduction and create learning sections. CRITICAL REQUIREMENTS:

1. EXTRACT ALL CONCEPTS: Identify every key term, concept, method, or technique mentioned. If a term is listed (e.g., "SWOT analysis, Porter's Five Forces, 4Ps"), create separate sections for EACH one.

2. CATEGORIZE each section as: "process", "framework", "method", "definition", "concept", or "comparison"
   - "process": Step-by-step procedures (e.g., SWOT analysis, STAR method)
   - "framework": Structured analytical tools (e.g., Porter's Five Forces, 4Ps)
   - "method": Specific techniques or approaches
   - "definition": Core concepts or terms - KEEP THESE SHORT (2-4 sentences only)
   - "concept": Abstract ideas or theories
   - "comparison": Comparing multiple approaches/concepts

3. FORMAT content appropriately:
   - For "definition": Keep explanation SHORT (2-4 sentences). No process/components needed.
   - For "process"/"framework"/"method": Include "process" array with clear steps
   - For "framework": Include "components" array with {name, description}
   - For "comparison": Include "comparisonPoints" array with {aspect, details}
   - Always include "explanation" (detailed for complex, short for definitions)
   - Always include "example" (concrete example)

4. EXERCISE RECOMMENDATION: For each section, determine if it warrants an exercise:
   - "hasExerciseButton": true for complex concepts, methods, frameworks, processes
   - "hasExerciseButton": true ALWAYS if the content contains ANY mathematical content:
     * Mathematical calculations, formulas, equations
     * Mathematical concepts, operations, or notation
     * Words like "calculate", "formula", "equation", "solve", "derive", "compute", "evaluate"
     * Mathematical symbols, numbers used in calculations, or step-by-step math procedures
     * Even if it's a "definition" format, if it involves math, set hasExerciseButton: true
   - "hasExerciseButton": false ONLY for simple definitions or basic concepts that have NO mathematical content
   - DO NOT generate exercises here - just indicate if one should be available

Return JSON:
{
  "learningSections": [
    {
      "id": "string (unique)",
      "title": "string (specific concept/term/method name)",
      "format": "process" | "framework" | "method" | "definition" | "concept" | "comparison",
      "content": {
        "explanation": "string (2-4 sentences for definitions, 8-15 for complex concepts)",
        "process": ["step 1", "step 2", ...] (only for process/framework/method),
        "components": [{"name": "string", "description": "string"}] (only for framework),
        "comparisonPoints": [{"aspect": "string", "details": "string"}] (only for comparison),
        "example": "string (concrete example)"
      },
      "hasExerciseButton": boolean,
      "practiceExercises": [] // Always empty array - exercises generated on-demand
    }
  ]
}

CRITICAL: 
- Definitions must be SHORT (2-4 sentences)
- If content lists terms/concepts, create sections for EACH one
- Only set hasExerciseButton: true for content that warrants practice
- Keep all content factual and accurate
- EXCLUDE general world knowledge: Do NOT create sections for overly basic, general knowledge that anyone would know (e.g., "math is a way of calculating numbers", "statistical calculations are a method to analyze data", "reading is a skill", "writing involves putting words on paper"). Only include content that is SPECIFIC to the topic and goal, and requires actual learning/instruction.
- FILTER OUT: If a section would only contain general knowledge that doesn't add value to the learning goal, exclude it entirely.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3, // Lower temperature for accuracy
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    // Ensure practiceExercises is always an empty array
    if (parsed.learningSections) {
      parsed.learningSections = parsed.learningSections.map((section) => ({
        ...section,
        practiceExercises: [],
      }))
    }
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate learning sections' })
  }
})

// Keep old endpoint for migration (will be removed later)
app.post('/api/learning-sections', async (req, res) => {
  const { subchapterContent, goal, subchapterTitle } = req.body || {}

  if (!subchapterContent || !goal || !subchapterTitle) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert instructional designer. Break down the subchapter into detailed learning sections that thoroughly explain every concept, term, and method mentioned.'
    const user = `
Subchapter Title: ${subchapterTitle}
Goal: ${goal}
Introduction/Overview:
${subchapterContent}

Analyze the introduction above and identify ALL key concepts, terms, methods, and techniques mentioned. For each one, create a detailed learning section.

Return JSON:
{
  "learningSections": [
    {
      "id": "string (unique)",
      "title": "string (specific concept/term/method name)",
      "content": "8-15 sentences that thoroughly explain: what it is, how it works, why it matters, step-by-step process (if applicable), common pitfalls, and a concrete example or scenario. Be comprehensive and detailed."
    }
  ]
}

Requirements:
- Extract every significant term, concept, or method mentioned in the introduction
- If a term is mentioned but not explained (e.g., "SWOT analysis"), create a section that fully explains it
- If a method is mentioned, explain how to actually perform it with steps
- Each section should be self-contained and teachable
- Include practical examples tied to the goal
- Order sections logically (foundational concepts first, then applications)
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate learning sections' })
  }
})

app.post('/api/learning-sections-enhancement', async (req, res) => {
  const { learningSections, goal, subchapterTitle } = req.body || {}

  if (!learningSections || !Array.isArray(learningSections) || !goal || !subchapterTitle) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert instructional designer. Categorize and format learning sections optimally, then generate interactive practice exercises.'
    const user = `
Subchapter Title: ${subchapterTitle}
Goal: ${goal}
Learning Sections (raw):
${JSON.stringify(learningSections, null, 2)}

For each learning section, you must:
1. CATEGORIZE it as one of: "process", "framework", "method", "definition", "concept", "comparison"
   - "process": Step-by-step procedures (e.g., SWOT analysis, STAR method)
   - "framework": Structured analytical tools (e.g., Porter's Five Forces, 4Ps)
   - "method": Specific techniques or approaches
   - "definition": Core concepts or terms that need explanation
   - "concept": Abstract ideas or theories
   - "comparison": Comparing multiple approaches/concepts

2. FORMAT the content appropriately:
   - For "process"/"framework"/"method": Include a "process" array with clear steps
   - For "comparison": Include "comparisonPoints" array with {aspect, details}
   - For "framework": Include "components" array with {name, description}
   - Always include "explanation" (detailed explanation)
   - Always include "example" (concrete example)

3. GENERATE 1-2 practice exercises per section:
   - For process/framework/method: "Apply [method] to [scenario]" with example scenario
   - For definition/concept: "Explain [concept] in your own words" or "Give an example of [concept]"
   - Exercises should be interactive and test understanding

Return JSON:
{
  "learningSections": [
    {
      "id": "string (same as input)",
      "title": "string (same as input)",
      "format": "process" | "framework" | "method" | "definition" | "concept" | "comparison",
      "content": {
        "explanation": "string (8-15 sentences)",
        "process": ["step 1", "step 2", ...] (only for process/framework/method),
        "components": [{"name": "string", "description": "string"}] (only for framework),
        "comparisonPoints": [{"aspect": "string", "details": "string"}] (only for comparison),
        "example": "string (concrete example)"
      },
      "practiceExercises": [
        {
          "id": "string (unique)",
          "prompt": "string (the exercise question)",
          "exampleScenario": "string (if applicable, a scenario to work with)"
        }
      ]
    }
  ]
}

CRITICAL: Only include "process", "components", or "comparisonPoints" if the format requires it. Not all sections need processes!
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to enhance learning sections' })
  }
})

// New endpoint: Generate exercise on-demand for a learning section
app.post('/api/generate-section-exercise', async (req, res) => {
  const { learningSection, previousSections, goal } = req.body || {}

  if (!learningSection || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert tutor. Generate a single exercise that tests understanding of the learning section. The exercise must ONLY test material from the current section and previous sections shown above it.'

    const previousSectionsText = previousSections && Array.isArray(previousSections) && previousSections.length > 0
      ? '\n\nPrevious Sections (material already shown to user):\n' + previousSections.map((s, idx) => 
          `${idx + 1}. ${s.title}\n${s.content.explanation || ''}${s.content.process ? '\nProcess: ' + s.content.process.join(', ') : ''}`
        ).join('\n\n')
      : ''

    const user = `
Goal: ${goal}
${previousSectionsText}

Current Learning Section:
Title: ${learningSection.title}
Format: ${learningSection.format}
Content: ${JSON.stringify(learningSection.content, null, 2)}

Generate ONE exercise that:
1. Tests understanding of the current section
2. ONLY uses material from the current section and previous sections (never ask about material not yet shown)
3. Is appropriate for the content type:
   - For process/framework/method: Prefer open-ended with scenario
   - For definition/concept: Prefer MCQ or simple open-ended
   - Decide based on what best tests understanding

Return JSON:
{
  "exercise": {
    "id": "string (unique)",
    "type": "open-ended" | "mcq",
    "prompt": "string (the question/prompt)",
    "options": [{"id": "a"|"b"|"c"|"d", "text": "string", "isCorrect": boolean}] (only for mcq),
    "solutionExplanation": "string (brief explanation)"
  }
}

CRITICAL: The exercise must be answerable using ONLY the current section and previous sections. Never reference material not yet shown.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.5, // Slightly creative for scenarios
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate exercise' })
  }
})

// New endpoint: Generate material for knowledge gap
app.post('/api/generate-gap-material', async (req, res) => {
  const { knowledgeGap, learningSection, goal } = req.body || {}

  if (!knowledgeGap || !learningSection || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert tutor. Provide a short, factual explanation that addresses a specific knowledge gap. Be accurate and concise.'

    const user = `
Goal: ${goal}
Learning Section: ${learningSection.title}
Format: ${learningSection.format}
Section Content: ${JSON.stringify(learningSection.content, null, 2)}

Knowledge Gap Identified:
${knowledgeGap}

Provide a short explanation (2-4 sentences) that directly addresses this knowledge gap. Be factual, accurate, and focused on what the user is missing.

Return JSON:
{
  "material": "string (2-4 sentences addressing the gap)"
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2, // Very low for factual content
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate gap material' })
  }
})

// New endpoint: Answer follow-up question about an exercise
app.post('/api/exercise-follow-up', async (req, res) => {
  const { exercise, followUpQuestion, learningSection, goal } = req.body || {}

  if (!exercise || !followUpQuestion || !learningSection || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert tutor. Analyze follow-up questions about exercises and respond appropriately based on the question\'s intention. You can either extend the scenario creatively or provide factual explanations.'

    const user = `
Goal: ${goal}
Learning Section: ${learningSection.title}
Format: ${learningSection.format}
Section Content: ${JSON.stringify(learningSection.content, null, 2)}

Exercise:
Prompt: ${exercise.prompt}
${exercise.exampleScenario ? `Scenario: ${exercise.exampleScenario}` : ''}
${exercise.options ? `Options: ${JSON.stringify(exercise.options, null, 2)}` : ''}

Student's Follow-up Question:
${followUpQuestion}

ANALYZE the question's intention:

1. SCENARIO EXTENSION: If the question asks for more details about the scenario/storyline (e.g., "what type of tech company?", "how many employees?", "what's the company's name?", "what industry?", "where is it located?"), then:
   - Creatively extend the case study with new, realistic details
   - Make the details consistent with the existing scenario
   - The information doesn't need to be factual - it's a creative extension
   - Keep it concise (2-3 sentences)
   - Example: If asked "what type of tech company?", you might say "It's a mid-sized SaaS company specializing in project management software, with about 150 employees and annual revenue of $20 million."

2. FACTUAL EXPLANATION: If the question asks for factual information about concepts, terms, or methods (e.g., "what is a tech company?", "what does SWOT mean?", "how does X work?"), then:
   - Provide a factual, educational explanation
   - Reference the learning section content when relevant
   - Guide the student toward understanding without giving away the solution
   - Keep it concise (2-4 sentences)

Return JSON:
{
  "answer": "string (2-4 sentences, either creative scenario extension or factual explanation based on question intent)",
  "intent": "scenario-extension" | "factual-explanation"
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6, // Higher temperature for creative scenario extensions, but still controlled
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to answer follow-up question' })
  }
})

// New endpoint: Explain selected text
app.post('/api/explain-selection', async (req, res) => {
  const { selectedText, surroundingContext, learningSection, goal } = req.body || {}

  if (!selectedText || !learningSection || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert tutor. Provide a brief, accurate explanation or definition for the selected text. Be concise and factual.'

    const user = `
Goal: ${goal}
Learning Section: ${learningSection.title}
Format: ${learningSection.format}
${surroundingContext ? `Surrounding Context: ${surroundingContext}` : ''}

Selected Text to Explain:
"${selectedText}"

Provide a brief explanation (1-3 sentences) that explains what this selected text means. If it's a term, define it. If it's a method, briefly explain it. If it's a concept, clarify it.

Return JSON:
{
  "explanation": "string (1-3 sentences)"
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2, // Very low for factual content
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to explain selection' })
  }
})

// Keep old endpoint for migration (will be removed later)
app.post('/api/practice-exercise-refine', async (req, res) => {
  const { exercises, learningSection, goal } = req.body || {}

  if (!exercises || !Array.isArray(exercises) || !learningSection || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert instructional designer. Refine practice exercises to be more specific, actionable, and answerable with concrete details.'

    const user = `
Goal: ${goal}
Learning Section: ${learningSection.title}
Format: ${learningSection.format}
Content: ${JSON.stringify(learningSection.content, null, 2)}

Current Practice Exercises:
${JSON.stringify(exercises, null, 2)}

Rewrite each exercise so it can be completed with specific, real details instead of abstract explanations. For each exercise:

1. If it's a scenario-based exercise: Make the scenario more detailed and realistic with specific context, numbers, names, or concrete situations
2. If it's a question: Add clear sub-steps, fill-in guidance, or structured prompts that guide the student
3. Include realistic example details that make the exercise accomplishable
4. Keep it practical, short, and suitable for students currently studying

Return JSON:
{
  "exercises": [
    {
      "id": "string (same as input)",
      "prompt": "string (refined, more specific prompt with clear guidance)",
      "exampleScenario": "string (refined scenario with concrete details, or null if not applicable)"
    }
  ]
}

CRITICAL: Make exercises answerable with specific details. Add concrete context, numbers, names, or structured guidance as needed.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to refine practice exercises' })
  }
})

app.post('/api/practice-exercise-evaluate', async (req, res) => {
  const { exercise, userAnswer, learningSection, goal } = req.body || {}

  if (!exercise || !userAnswer || !learningSection || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert tutor. Evaluate practice exercise answers with detailed feedback, scoring, and knowledge gap identification.'

    const user = `
Goal: ${goal}
Learning Section: ${learningSection.title}
Format: ${learningSection.format}
Content: ${JSON.stringify(learningSection.content, null, 2)}

Practice Exercise:
Prompt: ${exercise.prompt}
${exercise.exampleScenario ? `Scenario: ${exercise.exampleScenario}` : ''}

User Answer:
${userAnswer}

Evaluate the user's answer. Consider:
- Did they understand the concept/method?
- Did they apply it correctly (if applicable)?
- Are there gaps in their understanding?
- How complete is their answer?

Return JSON:
{
  "feedback": "string (2-4 sentences of constructive feedback)",
  "score": 0-100,
  "knowledgeGap": "string (one specific gap to address, or null if answer is excellent)"
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to evaluate practice exercise' })
  }
})

app.post('/api/evaluate', async (req, res) => {
  const { exercise, userAnswer, goal, subchapterContent } = req.body || {}

  if (!exercise || !userAnswer || !goal || !subchapterContent) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert tutor. Grade the answer, give feedback, and identify knowledge gaps briefly.'

    const user = `
Goal: ${goal}
Subchapter content:
${subchapterContent}

Exercise:
${JSON.stringify(exercise, null, 2)}

User answer:
${userAnswer}

Return JSON:
{
  "isCorrect": boolean,
  "feedback": "short feedback (2-3 sentences)",
  "knowledgeGap": "one concise gap to address, or null",
  "score": 0-100,
  "correctOptionId": "id" (for mcq, otherwise null)
}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to evaluate answer' })
  }
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// Export for Vercel serverless
export default app

// Only start server if not in Vercel environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`StudyHub API listening on http://localhost:${PORT}`)
  })
}


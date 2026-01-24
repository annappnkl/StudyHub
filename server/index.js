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
      'You are an expert instructional designer. Create a comprehensive, coordinated study plan that organizes concepts logically across chapters without duplication.'
    
    const user = `
Create a structured lecture plan that COMPLETELY covers the topic to achieve the goal with intelligent content coordination.

- Topic: ${topic}
- Goal: ${goal}
- Materials summary (optional): ${materialsSummary || 'N/A'}

CRITICAL REQUIREMENTS FOR CONTENT COORDINATION:

1. **CONCEPT MAPPING**: First, identify ALL key concepts, frameworks, methods, and topics needed to achieve the goal.

2. **INTELLIGENT DISTRIBUTION**: Distribute concepts across chapters logically:
   - Each concept should appear in EXACTLY ONE chapter where it's most appropriate
   - If multiple frameworks are needed (e.g., SWOT, Porter's 5 Forces, BCG Matrix), organize them by logical grouping or complexity
   - Ensure prerequisites are in earlier chapters
   - Group related concepts together

3. **NO DUPLICATION**: Each framework, method, or concept should only be taught once across the entire lecture
   - For example, if SWOT analysis is covered in Chapter 2, it should NOT appear in Chapter 4
   - If profitability frameworks are in Chapter 1, don't repeat them in Chapter 3
   - Cross-reference concepts when needed, but don't re-teach them

4. **CONCEPT OUTLINES**: Instead of full content, provide concept outlines:
   - List the 3-5 key concepts/frameworks that will be taught in each subchapter
   - Include a brief (1-2 sentence) description of what the subchapter will cover
   - Focus on WHAT will be learned, not HOW it will be taught (detailed content comes later)

5. **LOGICAL PROGRESSION**: Ensure chapters build on each other:
   - Foundational concepts first
   - More complex applications later
   - Each chapter should naturally lead to the next

Return JSON with:
{
  "lectureTitle": "string",
  "conceptMap": {
    "allConcepts": ["list of ALL concepts that will be taught across entire lecture"],
    "chapterDistribution": {
      "chapter1": ["concepts assigned to chapter 1"],
      "chapter2": ["concepts assigned to chapter 2"],
      // ... etc
    }
  },
  "chapters": [
    {
      "id": "string (unique)",
      "title": "string (clear chapter theme)",
      "description": "2-3 sentences describing this chapter's focus and how it fits in the overall learning progression",
      "subchapters": [
        {
          "id": "string (unique)",
          "title": "string (specific concept/method name)",
          "conceptOutline": [
            "Concept/framework 1 that will be taught",
            "Concept/framework 2 that will be taught",
            "Concept/framework 3 that will be taught"
          ],
          "content": "1-2 sentences describing what this subchapter will teach (learning objectives, not the actual teaching content)"
        }
      ]
    }
  ]
}

EXAMPLE for "case study interview prep":
- Chapter 1: "Foundational Frameworks" might cover SWOT, Porter's 5 Forces
- Chapter 2: "Quantitative Analysis" might cover profitability trees, market sizing
- Chapter 3: "Advanced Techniques" might cover competitive analysis, strategic recommendations
- Each framework appears ONLY in its designated chapter

Generate a comprehensive, well-coordinated plan without concept duplication.
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
    
    // Always add Interview Practice as the final chapter
    const interviewChapter = {
      id: 'interview-practice',
      title: 'Interview Practice',
      subchapters: [{
        id: 'case-interview-practice',
        title: 'Case Study Interview Simulation',
        content: 'Practice your consulting case interview skills with our AI-powered interview simulator. This interactive session will guide you through a real McKinsey-style case study with voice interaction and real-time feedback.',
        conceptOutline: ['Case Study Analysis', 'Quantitative Problem Solving', 'Structured Thinking', 'Professional Communication']
      }]
    }
    
    // Add to concept map
    if (parsed.conceptMap) {
      parsed.conceptMap.allConcepts.push('Case Study Analysis', 'Quantitative Problem Solving', 'Structured Thinking', 'Professional Communication')
      parsed.conceptMap.chapterDistribution['interview-practice'] = ['Case Study Analysis', 'Quantitative Problem Solving', 'Structured Thinking', 'Professional Communication']
    }
    
    // Add the interview chapter
    parsed.chapters.push(interviewChapter)
    
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
  const { subchapterContent, goal, subchapterTitle, knowledgeLevels, conceptMap, conceptOutline } = req.body || {}

  if (!subchapterContent || !goal || !subchapterTitle) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert instructional designer. Create accurate, factual learning sections with appropriate formatting. Focus on accuracy over creativity and personalize content based on user knowledge levels.'
    
    const knowledgeContext = knowledgeLevels && knowledgeLevels.length > 0 
      ? `\n\nUser Knowledge Assessment:
${knowledgeLevels.map(kl => `- ${kl.skillName}: ${kl.knowledgeLevel} level (score: ${Math.round(kl.score * 100)}%)`).join('\n')}

PERSONALIZATION INSTRUCTIONS:
- For skills marked as "beginner": Include more foundational content, detailed explanations, and step-by-step guidance
- For skills marked as "intermediate": Focus on practical applications and deeper understanding  
- For skills marked as "advanced": Emphasize advanced applications, edge cases, and nuanced aspects
- Adjust content depth and exercise complexity based on these knowledge levels
- Ensure content builds appropriately on user's existing knowledge
- TRACK PERSONALIZATION: For each section, note which skills influenced the content adjustment and why`
      : ''

    const conceptCoordinationContext = conceptMap && conceptOutline 
      ? `\n\nCONCEPT COORDINATION (CRITICAL):
This subchapter should ONLY teach these specific concepts: ${JSON.stringify(conceptOutline)}

CONCEPTS TAUGHT IN OTHER CHAPTERS (DO NOT DUPLICATE):
${Object.entries(conceptMap.chapterDistribution || {})
  .filter(([chapterId, concepts]) => !concepts.some(c => conceptOutline?.includes(c)))
  .map(([chapterId, concepts]) => `- ${chapterId}: ${concepts.join(', ')}`)
  .join('\n')}

STRICT RULE: Only create learning sections for concepts in your assigned conceptOutline. Do not create sections for concepts assigned to other chapters.`
      : ''

    const user = `
Subchapter Title: ${subchapterTitle}
Goal: ${goal}
Introduction/Overview:
${subchapterContent}${knowledgeContext}${conceptCoordinationContext}

Analyze the introduction and create learning sections. CRITICAL REQUIREMENTS:

1. EXTRACT ALL CONCEPTS: Identify every key term, concept, method, or technique mentioned. If a term is listed (e.g., "SWOT analysis, Porter's Five Forces, 4Ps"), create separate sections for EACH one.

2. CATEGORIZE each section as: "process", "framework", "method", "concept", or "comparison"
   - "process": Step-by-step procedures (e.g., SWOT analysis, STAR method)
   - "framework": Structured analytical tools (e.g., Porter's Five Forces, 4Ps)
   - "method": Specific techniques or approaches
   - "concept": Abstract ideas or theories (integrate definitions contextually in explanations)
   - "comparison": Comparing multiple approaches/concepts
   
   NOTE: Do NOT create separate "definition" sections. Instead, integrate key term definitions naturally within the explanations of concepts, processes, or frameworks.

3. FORMAT content with TYPE-SPECIFIC approach:

**FOR PROCESS SECTIONS:**
- Focus on actionable, step-by-step instructions
- Include "process" array with clear, implementable steps
- Explanation should emphasize HOW TO EXECUTE the process
- Examples should be ONLY included if they demonstrate a complex step or common pitfall
- Avoid generic company examples - focus on the methodology itself

**FOR FRAMEWORK SECTIONS:**
- Provide framework structure with "components" array {name, description}
- Explanation should focus on WHEN and HOW to apply the framework
- Skip basic examples like "SWOT analysis for Apple" - focus on framework application principles
- Include examples ONLY if they illustrate framework adaptation or advanced usage

**FOR METHOD SECTIONS:**
- Explain the technique with implementation details
- Include "process" array if method has sequential steps
- Focus on practical application rather than theoretical background
- Avoid generic scenarios - emphasize method execution and variations

**FOR CONCEPT SECTIONS:**
- Provide clear definition integrated within comprehensive explanation
- Focus on contextual understanding and practical implications
- Include examples ONLY for complex concepts where they add significant clarification
- Avoid obvious examples - prioritize concept depth and nuance

**FOR COMPARISON SECTIONS:**
- Use "comparisonPoints" array with {aspect, details} structure
- Focus on key differentiators and decision criteria
- Explain WHEN to choose each approach
- Skip generic pros/cons lists - emphasize strategic application

**SMART EXAMPLE LOGIC:**
- Examples are OPTIONAL and should only be included when they:
  * Illustrate a complex application that's hard to grasp otherwise
  * Demonstrate common mistakes or edge cases
  * Show advanced or nuanced usage
- NEVER include examples for:
  * Simple definitions or basic concepts
  * Well-known frameworks unless showing advanced application
  * Obvious processes that don't need illustration

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
      "format": "process" | "framework" | "method" | "concept" | "comparison",
      "content": {
        "explanation": "string (8-15 sentences, adjust depth based on user knowledge level)",
        "process": ["step 1", "step 2", ...] (only for process/framework/method with sequential steps),
        "components": [{"name": "string", "description": "string"}] (only for framework),
        "comparisonPoints": [{"aspect": "string", "details": "string"}] (only for comparison),
        "example": "string (OPTIONAL - only include if it adds significant value per smart example logic above)",
        "exampleReason": "string (OPTIONAL - if example is included, briefly explain why it's necessary)"
      },
      "hasExerciseButton": boolean,
      "practiceExercises": [], // Always empty array - exercises generated on-demand
      "contentQuality": {
        "focusedOnPracticalApplication": boolean,
        "avoidedGenericExamples": boolean,
        "formatSpecificApproach": boolean
      },
      "personalization": {
        "wasPersonalized": boolean,
        "adjustedForSkills": ["skillName1", "skillName2"] (if personalized),
        "adjustmentReason": "string (brief explanation of why content was adjusted based on assessment)",
        "knowledgeLevelFocus": "beginner" | "intermediate" | "advanced" (if personalized)
      }
    }
  ],
  "overallPersonalization": {
    "totalSectionsPersonalized": number,
    "primaryAdjustmentReasons": ["reason1", "reason2"],
    "knowledgeLevelsAddressed": ["beginner", "intermediate", "advanced"]
  }
}

CRITICAL FORMAT-SPECIFIC REQUIREMENTS: 
- APPLY the format-specific approach above - each content type has different generation rules
- SMART EXAMPLES: Only include examples that truly add value. Most basic concepts and frameworks don't need examples.
- NO separate definition sections - integrate definitions within concept explanations
- If content lists terms/concepts, create sections for EACH one but as "concept" format with integrated definitions
- FOCUS ON PRACTICAL APPLICATION: Prioritize how-to guidance over theoretical background
- AVOID GENERIC EXAMPLES: Skip obvious examples like "SWOT for Apple" or "BCG matrix for tech company"
- Only set hasExerciseButton: true for content that warrants practice
- Keep all content factual and accurate - reduce creativity, focus on precision
- PERSONALIZE content depth based on user's assessed knowledge levels
- EXCLUDE general world knowledge: Do NOT create sections for overly basic, general knowledge that anyone would know
- FILTER OUT: If a section would only contain general knowledge that doesn't add value to the learning goal, exclude it entirely
- QUALITY CHECK: Each section should pass the "does this teach something specific and actionable?" test
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

// New endpoint: Generate skills/topics for assessment
app.post('/api/generate-skills', async (req, res) => {
  const { topic, goal, lectureContent } = req.body || {}

  if (!topic || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert educational consultant. Analyze learning goals and the actual lecture content to identify the key skills that need to be assessed.'

    const lectureContext = lectureContent 
      ? `\n\nGenerated Lecture Structure:
${lectureContent.chapters.map(ch => 
  `Chapter: ${ch.title}
  Subchapters: ${ch.subchapters.map(sub => `- ${sub.title}: ${sub.content.substring(0, 200)}...`).join('\n  ')}`
).join('\n\n')}`
      : ''

    const user = `
Topic: ${topic}
Learning Goal: ${goal}${lectureContext}

Based on the actual lecture content generated above, identify 4-6 specific skills that need to be assessed. 

Focus on CONCRETE skills that can be tested with specific questions like:
- "Can you perform a SWOT analysis right now?"
- "Do you know how to calculate NPV step-by-step?"
- "Can you structure a market sizing problem in 2 minutes?"

For each skill/topic:
1. Make it SPECIFIC to the actual chapters and subchapters shown above
2. Focus on actionable, testable competencies
3. Ensure they can be assessed with practical "can you do X?" questions
4. Base skills on what will actually be taught in the lecture

Return JSON:
{
  "skills": [
    {
      "id": "string (unique)",
      "name": "string (specific skill from the lecture content)",
      "category": "string (e.g., 'Framework Application', 'Mathematical Skills', 'Analytical Thinking')",
      "importance": "high" | "medium" | "low",
      "description": "string (why this specific skill matters for the goal)",
      "relatedChapter": "string (which chapter this skill relates to)"
    }
  ]
}

CRITICAL REQUIREMENTS:
- Generate 4-6 skills maximum based on actual lecture content
- Each skill should be assessable through specific, practical questions
- Focus on skills directly taught in the lecture chapters
- Avoid generic skills - be specific to the actual content
- Make skills testable with "Can you..." or "Do you know how to..." questions
- Connect each skill to specific chapters/subchapters when possible

Example for case interview training lecture:
- SWOT Analysis Execution (if chapter covers SWOT) (high importance)
- Financial Calculation Methods (if chapter covers business math) (high importance) 
- Market Sizing Structuring (if chapter covers market sizing) (medium importance)
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4, // Balanced for structured thinking
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate skills' })
  }
})

// New endpoint: Generate assessment questions
app.post('/api/generate-assessment', async (req, res) => {
  const { skills, goal, lectureContent } = req.body || {}

  if (!skills || !Array.isArray(skills) || !goal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const system =
      'You are an expert assessment designer. Create specific, actionable questions based on the actual lecture content that test real competencies.'

    const lectureContext = lectureContent 
      ? `\n\nDetailed Lecture Content:
${lectureContent.chapters.map(ch => 
  `Chapter: ${ch.title}
  ${ch.subchapters.map(sub => `
  Subchapter: ${sub.title}
  Content: ${sub.content}`).join('\n')}`
).join('\n\n')}`
      : ''

    const user = `
Learning Goal: ${goal}
Skills to Assess: ${JSON.stringify(skills, null, 2)}${lectureContext}

Using the detailed lecture content above, generate exactly 4 specific, actionable assessment questions per skill.

Each question should:
1. Test SPECIFIC knowledge from the lecture content (not generic knowledge)
2. Be answerable with "Know" or "Don't Know" 
3. Focus on practical application ("Can you...?", "Do you know how to...?")
4. Reference specific frameworks, methods, or concepts from the chapters

Question types per skill:
- 1 foundational: Basic understanding of core concept
- 2 application: Practical ability to use the skill  
- 1 advanced: Nuanced or complex application

Examples of good questions:
- "Can you perform a complete SWOT analysis for a tech startup in 5 minutes?"
- "Do you know the exact steps to calculate NPV with irregular cash flows?"
- "Can you structure a market entry case using Porter's Five Forces framework?"
- "Do you know how to adapt the profitability framework for a declining revenue case?"

Return JSON:
{
  "questions": [
    {
      "id": "string (unique)",
      "skillId": "string (matches skill.id)", 
      "skillName": "string (matches skill.name)",
      "category": "string (matches skill.category)",
      "question": "string (specific, actionable question based on lecture content)",
      "relatedConcept": "string (what specific framework/method this tests)"
    }
  ]
}

CRITICAL REQUIREMENTS:
- Generate exactly 4 questions per skill (total: skills.length * 4)
- Questions must be specific to the lecture content, not generic
- Test real competencies that someone would need for the learning goal
- Focus on actionable skills ("Can you do X?") rather than theoretical knowledge
- Reference specific concepts, frameworks, or methods from the lecture chapters
- Each question should help determine actual skill level, not just awareness

Example for SWOT Analysis skill (if covered in lecture):
- "Do you know what each letter in SWOT stands for?" (foundational)
- "Can you perform a SWOT analysis for a specific company in under 5 minutes?" (application)
- "Can you identify which external factors belong in Opportunities vs Threats?" (application)
- "Do you know how to prioritize SWOT factors by impact and likelihood?" (advanced)
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3, // Lower temperature for consistent, clear questions
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate assessment questions' })
  }
})

// New endpoint: Generate comprehensive chapter test
app.post('/api/generate-chapter-test', async (req, res) => {
  const { 
    chapterData,      // All subchapters and learning sections
    userExerciseHistory, // Previous exercise attempts and scores  
    assessmentResults,   // User knowledge levels
    goal 
  } = req.body || {}

  if (!chapterData || !goal) {
    return res.status(400).json({ error: 'Missing required fields (chapterData, goal)' })
  }

  try {
    const system = 'You are an expert test designer. Create comprehensive, hands-on tests that assess mastery of chapter content with detailed, realistic scenarios.'

    // Build context about user performance and knowledge levels
    const userContext = assessmentResults 
      ? `\n\nUser Knowledge Assessment:
${assessmentResults.map(skill => `- ${skill.skillName}: ${skill.knowledgeLevel} level (${Math.round(skill.assessmentScore * 100)}% knowledge)`).join('\n')}

ADAPTIVE TEST STRATEGY:
- Focus MORE on areas where user has "beginner" or "intermediate" levels
- Include advanced applications for "advanced" level skills
- Weight difficulty and question count based on knowledge gaps`
      : ''

    const exerciseHistoryContext = userExerciseHistory && userExerciseHistory.length > 0
      ? `\n\nUser Exercise Performance History:
${userExerciseHistory.map(ex => `- ${ex.sectionTitle}: ${ex.success ? 'Success' : 'Struggled'} (Score: ${ex.score || 'N/A'})`).join('\n')}

PERFORMANCE-BASED FOCUS:
- Generate more questions for topics where user struggled
- Include follow-up questions for areas with low scores`
      : ''

    const user = `
Goal: ${goal}
Chapter Title: ${chapterData.title}

Chapter Content Analysis:
${chapterData.subchapters.map(sub => `
Subchapter: ${sub.title}
Learning Sections: ${sub.learningSections.map(ls => `
- ${ls.title} (${ls.format}): ${ls.content.explanation.substring(0, 200)}...`).join('')}
`).join('\n')}${userContext}${exerciseHistoryContext}

Generate a comprehensive chapter test with 5-7 questions that cover the ENTIRE chapter content.

QUESTION STRUCTURE REQUIREMENTS:

1. **Framework Application Questions (2-3 questions):**
   - For frameworks like SWOT, Porter's Five Forces, etc.
   - Include DETAILED company/scenario descriptions (150-300 words)
   - Provide enough context for thorough analysis
   - Example: "TechFlow Inc. is a 5-year-old SaaS company providing project management tools. They started with 10 employees and have grown to 200 people across 8 countries. Their main product serves mid-market companies (100-1000 employees). Recently, they've faced increased competition from Microsoft's new project management features and Slack's workflow tools. The company has strong customer loyalty (95% retention) but struggles with feature bloat and longer sales cycles. Their engineering team is split between maintaining the core product and developing AI-powered features. Founder-CEO Sarah Martinez is considering whether to focus on enterprise clients, international expansion, or AI innovation. Using SWOT analysis, evaluate TechFlow's strategic position and provide recommendations."

2. **Process Implementation Questions (1-2 questions):**
   - Step-by-step method application  
   - Include realistic constraints and parameters
   - Test ability to execute learned processes

3. **Conceptual Understanding Questions (1-2 questions):**
   - Can be MCQ or short answer
   - Test key theoretical knowledge
   - Include application context

4. **Integration Question (1 question):**
   - Combines multiple concepts from the chapter
   - Tests holistic understanding
   - Most challenging question

CRITICAL TEST DESIGN PRINCIPLES:
- Each question must be answerable using ONLY content taught in this chapter
- Scenarios must be detailed enough for thorough analysis
- Weight questions toward user's weaker knowledge areas
- Include variety of question types (scenario-based, MCQ, short answer)
- Questions should take 5-15 minutes each to complete properly
- Provide clear instructions for what depth of answer is expected

Return JSON:
{
  "test": {
    "id": "string (unique)",
    "chapterId": "string (matches chapterData.id)",
    "title": "string (Chapter X - Comprehensive Test)",
    "estimatedTimeMinutes": number,
    "questions": [
      {
        "id": "string (unique)",
        "type": "scenario-based" | "mcq" | "short-answer" | "integration",
        "prompt": "string (clear question/instruction)",
        "detailedScenario": "string (rich company/situation description, 150-300 words for scenario-based)",
        "options": [{"id": "a|b|c|d", "text": "string", "isCorrect": boolean}] (only for MCQ),
        "expectedAnswerLength": "brief" | "moderate" | "comprehensive",
        "relatedSections": ["sectionId1", "sectionId2"], 
        "difficulty": "beginner" | "intermediate" | "advanced",
        "maxPoints": number,
        "evaluationCriteria": ["criterion1", "criterion2"] (what to look for in answers)
      }
    ],
    "totalPoints": number,
    "adaptedForUser": {
      "focusedOnWeakAreas": ["skill1", "skill2"],
      "difficultyAdjustments": "string (explanation of how test was adapted)"
    }
  }
}

CRITICAL: Scenarios must be realistic, detailed, and provide sufficient information for thorough analysis. Each question should test practical application, not just memorization.
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4, // Balanced between consistency and creativity for scenarios
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    return res.json(parsed)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to generate chapter test' })
  }
})

// New endpoint: Evaluate chapter test
app.post('/api/evaluate-chapter-test', async (req, res) => {
  const { 
    test,
    answers,
    timeSpentMinutes,
    goal,
    userAssessmentResults
  } = req.body || {}

  if (!test || !answers || !Array.isArray(answers) || !goal) {
    return res.status(400).json({ error: 'Missing required fields (test, answers, goal)' })
  }

  try {
    const system = 'You are an expert educational evaluator. Provide detailed, constructive feedback on chapter test performance with actionable recommendations.'

    const userContext = userAssessmentResults 
      ? `\n\nUser Knowledge Assessment Context:
${userAssessmentResults.map(skill => `- ${skill.skillName}: ${skill.knowledgeLevel} level (${Math.round(skill.assessmentScore * 100)}% knowledge)`).join('\n')}

Use this context to provide personalized feedback and recommendations.`
      : ''

    const user = `
Learning Goal: ${goal}
Test Title: ${test.title}
Time Spent: ${timeSpentMinutes} minutes (Estimated: ${test.estimatedTimeMinutes} minutes)

Test Questions & User Answers:
${answers.map((answer, idx) => {
  const question = test.questions.find(q => q.id === answer.questionId)
  return `
Question ${idx + 1} (${question?.type || 'unknown'} - ${question?.difficulty || 'unknown'} - ${question?.maxPoints || 0} points):
Prompt: ${question?.prompt || 'Unknown question'}
${question?.detailedScenario ? `Scenario: ${question.detailedScenario.substring(0, 300)}...` : ''}
User Answer: ${answer.userAnswer}
${answer.selectedOptionId ? `Selected Option: ${answer.selectedOptionId}` : ''}
Evaluation Criteria: ${question?.evaluationCriteria?.join(', ') || 'Not specified'}`
}).join('\n')}${userContext}

Evaluate each answer and provide comprehensive feedback:

For MCQ Questions:
- Check if selected option is correct
- Explain why the answer is right/wrong
- Provide learning points

For Open-Ended Questions:
- Assess completeness and accuracy
- Check against evaluation criteria
- Identify strengths and gaps
- Score on a 0-100 scale

For Scenario-Based Questions:
- Evaluate depth of analysis
- Check application of frameworks/methods
- Assess practical insights
- Look for real-world understanding

SCORING GUIDELINES:
- Advanced level responses (90-100): Exceptional understanding, complete application, insightful analysis
- Proficient level responses (75-89): Good understanding, mostly correct application, adequate analysis
- Developing level responses (60-74): Basic understanding, partial application, some gaps
- Beginning level responses (0-59): Limited understanding, significant gaps, needs improvement

Return JSON:
{
  "totalScore": number (sum of all question scores),
  "maxScore": number (sum of all possible points),
  "percentageScore": number (0-100),
  "timeEfficiency": "excellent" | "good" | "adequate" | "needs_improvement",
  "answers": [
    {
      "questionId": "string",
      "score": number (0 to question.maxPoints),
      "maxScore": number (question.maxPoints),
      "isCorrect": boolean (for MCQ),
      "feedback": "string (detailed, constructive feedback 2-4 sentences)",
      "strengths": ["string (what they did well)"],
      "improvements": ["string (specific areas to work on)"],
      "correctAnswer": "string (for MCQ, the correct option explanation)"
    }
  ],
  "overallFeedback": {
    "overallPerformance": "string (2-3 sentences overall assessment)",
    "strengths": ["string (top 2-3 strengths across all answers)"],
    "areasForImprovement": ["string (top 2-3 areas needing work)"],
    "recommendedActions": ["string (specific study suggestions)"],
    "masteryLevel": "beginner" | "intermediate" | "advanced",
    "performanceInsights": {
      "bestPerformingAreas": ["string (topics they excelled in)"],
      "strugglingAreas": ["string (topics needing more work)"],
      "frameworkApplication": "string (assessment of how well they applied learned frameworks)",
      "conceptualUnderstanding": "string (assessment of theoretical grasp)",
      "practicalApplication": "string (assessment of real-world application ability)"
    }
  },
  "nextSteps": {
    "shouldRetakeTest": boolean,
    "suggestedReviewSections": ["string (specific subchapter/section names)"],
    "readyForAdvanced": boolean,
    "estimatedStudyTime": "string (recommended additional study time)"
  }
}

CRITICAL EVALUATION PRINCIPLES:
- Be encouraging yet honest about performance
- Provide specific, actionable feedback
- Connect performance to learning objectives
- Suggest concrete next steps
- Consider user's original knowledge level in feedback
- Focus on growth and improvement
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3, // Lower temperature for consistent, fair evaluation
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')

    const parsed = JSON.parse(content)
    
    // Add metadata to the response
    const evaluationResult = {
      ...parsed,
      evaluatedAt: new Date().toISOString(),
      testId: test.id,
      evaluationVersion: '1.0'
    }
    
    return res.json(evaluationResult)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to evaluate chapter test' })
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


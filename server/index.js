import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import session from 'express-session'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import OpenAI from 'openai'
import { ObjectId } from 'mongodb'
import { connectDB, getDB } from './db.js'

dotenv.config()

const app = express()

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
)

app.use(express.json({ limit: '2mb' }))

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'studyhub-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  }),
)

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
        const db = await getDB()
        const usersCollection = db.collection('users')

        let user = await usersCollection.findOne({ googleId: profile.id })

        if (!user) {
          // Create new user
          const newUser = {
            googleId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            picture: profile.photos[0].value,
            createdAt: new Date(),
            lectures: [],
          }
          const result = await usersCollection.insertOne(newUser)
          user = { ...newUser, _id: result.insertedId }
        } else {
          // Update user info
          await usersCollection.updateOne(
            { googleId: profile.id },
            {
              $set: {
                name: profile.displayName,
                picture: profile.photos[0].value,
                lastLogin: new Date(),
              },
            },
          )
        }

        return done(null, user)
      } catch (err) {
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
    const usersCollection = db.collection('users')
    const user = await usersCollection.findOne({ _id: new ObjectId(id) })
    done(null, user)
  } catch (err) {
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
  if (code === ACCESS_CODE) {
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
  (req, res) => {
    // Redirect to frontend after successful login
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173')
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


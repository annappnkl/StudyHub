import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  evaluateExercise,
  requestLearningSectionsEnhanced,
  generateSectionExercise,
  generateGapMaterial,
  explainSelection,
  answerExerciseFollowUp,
  requestStudyPlan,
  checkAuth,
  logout as apiLogout,
  saveLecture,
  loadLectures,
  deleteLecture as apiDeleteLecture,
  type User,
} from './api'
import { AccessCodeScreen } from './components/AccessCodeScreen'
import { LoginScreen } from './components/LoginScreen'
import type {
  Chapter,
  Exercise,
  Lecture,
  LectureGenerationRequest,
  StudyPlanGenerationResponse,
  Subchapter,
  HighlightedText,
  LearningSection,
} from './types'

type LectureMap = Record<string, Lecture>

type GenerationStage = 'idle' | 'generating' | 'error'

interface LectureFormState {
  topic: string
  goal: string
  materialsSummary: string
}

function createLectureFromPlan(
  plan: StudyPlanGenerationResponse,
  request: LectureGenerationRequest,
): Lecture {
  const now = new Date().toISOString()
  const chapters: Chapter[] = plan.chapters.map((ch) => {
      const subchapters: Subchapter[] = ch.subchapters.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      learningSections: [], // will be populated lazily when user opens subchapter
      exercises: [], // will be populated lazily when user opens subchapter (on-demand)
      isCompleted: false,
      highlightedTexts: [], // Track highlighted text
    }))

    return {
      id: ch.id,
      title: ch.title,
      subchapters,
      isUnlocked: true, // All chapters unlocked by default
    }
  })

  return {
    id: `${Date.now()}`,
    title: plan.lectureTitle,
    goal: request.goal,
    createdAt: now,
    chapters,
    currentChapterId: chapters[0]?.id,
    currentSubchapterId: chapters[0]?.subchapters[0]?.id,
  }
}

function getActiveChapter(lecture: Lecture | undefined): Chapter | undefined {
  if (!lecture) return undefined
  return lecture.chapters.find((ch) => ch.id === lecture.currentChapterId)
}

function getActiveSubchapter(lecture: Lecture | undefined): Subchapter | undefined {
  const chapter = getActiveChapter(lecture)
  if (!lecture || !chapter) return undefined
  return chapter.subchapters.find((s) => s.id === lecture.currentSubchapterId)
}

interface ExerciseState {
  exerciseId: string
  userAnswer: string
  isCorrect?: boolean
  feedback?: string
  knowledgeGap?: string | null
  score?: number
  isLoading?: boolean
}

type AppState = 'access-code' | 'login' | 'loading' | 'app'

// Component to render text with highlighted sections
function TextWithHighlights({
  text,
  sectionId,
  highlightedTexts,
  onHighlightClick,
}: {
  text: string
  sectionId: string
  highlightedTexts: HighlightedText[]
  onHighlightClick: (text: string, explanation: string) => void
}) {
  const highlights = highlightedTexts.filter((ht) => ht.sectionId === sectionId)
  
  if (highlights.length === 0) {
    return <span>{text}</span>
  }

  // Simple implementation: highlight matching text (case-insensitive for better matching)
  const highlightMap = new Map<string, string>() // text -> explanation
  
  highlights.forEach((highlight) => {
    if (highlight.explanation) {
      highlightMap.set(highlight.text.toLowerCase(), highlight.explanation)
    }
  })

  if (highlightMap.size === 0) {
    return <span>{text}</span>
  }

  // Find and wrap highlighted text - use case-insensitive matching but preserve original case
  const parts: Array<{ text: string; isHighlighted: boolean; explanation?: string }> = []
  const textLower = text.toLowerCase()
  
  // Sort highlights by length (longest first) to avoid partial matches
  const sortedHighlights = Array.from(highlightMap.entries()).sort((a, b) => b[0].length - a[0].length)
  
  const matchedRanges: Array<{ start: number; end: number; explanation: string }> = []
  
  sortedHighlights.forEach(([highlightTextLower, explanation]) => {
    let searchIndex = 0
    while (true) {
      const index = textLower.indexOf(highlightTextLower, searchIndex)
      if (index === -1) break
      
      // Check if this range overlaps with an existing match
      const overlaps = matchedRanges.some(
        (range) => !(index + highlightTextLower.length <= range.start || index >= range.end),
      )
      
      if (!overlaps) {
        matchedRanges.push({
          start: index,
          end: index + highlightTextLower.length,
          explanation,
        })
      }
      
      searchIndex = index + 1
    }
  })
  
  // Sort ranges by start position
  matchedRanges.sort((a, b) => a.start - b.start)
  
  // Build parts array
  let lastIndex = 0
  matchedRanges.forEach((range) => {
    // Add text before this highlight
    if (range.start > lastIndex) {
      parts.push({ text: text.substring(lastIndex, range.start), isHighlighted: false })
    }
    // Add highlighted text (preserve original case from text)
    parts.push({
      text: text.substring(range.start, range.end),
      isHighlighted: true,
      explanation: range.explanation,
    })
    lastIndex = range.end
  })
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ text: text.substring(lastIndex), isHighlighted: false })
  }

  // If no parts were created, just return the text
  if (parts.length === 0) {
    return <span>{text}</span>
  }

  return (
    <span>
      {parts.map((part, idx) =>
        part.isHighlighted && part.explanation ? (
          <span
            key={idx}
            className="highlighted-text"
            onClick={() => {
              onHighlightClick(part.text, part.explanation!)
            }}
          >
            {part.text}
          </span>
        ) : (
          <span key={idx}>{part.text}</span>
        ),
      )}
    </span>
  )
}

// Component to render an exercise card
function ExerciseCard({
  exercise,
  onKnowledgeGap,
  onEvaluate,
  learningSection,
  goal,
}: {
  exercise: Exercise
  onKnowledgeGap: (gap: string) => void
  onEvaluate: (exercise: Exercise, userAnswer: string) => Promise<{
    isCorrect?: boolean
    feedback: string
    knowledgeGap?: string
    score?: number
  }>
  learningSection: LearningSection
  goal: string
}) {
  const [userAnswer, setUserAnswer] = useState('')
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<{
    isCorrect?: boolean
    feedback: string
    knowledgeGap?: string
    score?: number
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [followUpAnswer, setFollowUpAnswer] = useState<string | null>(null)
  const [isLoadingFollowUp, setIsLoadingFollowUp] = useState(false)

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      const result = await onEvaluate(
        exercise,
        exercise.type === 'mcq' ? selectedOption || '' : userAnswer,
      )
      setEvaluation(result)
    } catch (err) {
      console.error('Failed to evaluate exercise:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFollowUpQuestion = async () => {
    if (!followUpQuestion.trim()) return
    
    setIsLoadingFollowUp(true)
    try {
      const response = await answerExerciseFollowUp({
        exercise,
        followUpQuestion: followUpQuestion.trim(),
        learningSection,
        goal,
      })
      setFollowUpAnswer(response.answer)
    } catch (err) {
      console.error('Failed to answer follow-up question:', err)
      setFollowUpAnswer('Sorry, I could not answer your question. Please try again.')
    } finally {
      setIsLoadingFollowUp(false)
    }
  }

  if (exercise.type === 'mcq') {
    return (
      <div className="exercise-card">
        <p className="exercise-prompt">{exercise.prompt}</p>
        
        {/* Follow-up Question Section */}
        {!evaluation && (
          <div className="follow-up-question-section">
            <label className="follow-up-label">
              Follow up question
              <input
                type="text"
                value={followUpQuestion}
                onChange={(e) => setFollowUpQuestion(e.target.value)}
                placeholder="e.g., ask a follow up question about the exercise"
                className="follow-up-input"
                disabled={isLoadingFollowUp}
              />
            </label>
            {followUpQuestion.trim() && (
              <button
                type="button"
                className="follow-up-button"
                onClick={handleFollowUpQuestion}
                disabled={isLoadingFollowUp}
              >
                {isLoadingFollowUp ? 'Asking...' : 'Ask'}
              </button>
            )}
            {followUpAnswer && (
              <div className="follow-up-answer">
                <p>{followUpAnswer}</p>
              </div>
            )}
          </div>
        )}

        <div className="mcq-options">
          {exercise.options?.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`mcq-option ${
                selectedOption === option.id ? 'mcq-option--selected' : ''
              }`}
              onClick={() => setSelectedOption(option.id)}
              disabled={!!evaluation}
            >
              <span className="mcq-option-label">{option.id.toUpperCase()}.</span>
              <span>{option.text}</span>
            </button>
          ))}
        </div>
        {!evaluation && (
          <button
            type="button"
            className="secondary-button"
            onClick={handleSubmit}
            disabled={isLoading || !selectedOption}
          >
            {isLoading ? 'Checking...' : 'Check Answer'}
          </button>
        )}
        {evaluation && (
          <div className="exercise-feedback">
            <p className={evaluation.isCorrect ? 'exercise-feedback--correct' : 'exercise-feedback--incorrect'}>
              {evaluation.feedback}
            </p>
            {evaluation.knowledgeGap && (
              <>
                <p className="practice-gap">
                  <strong>Knowledge Gap:</strong> {evaluation.knowledgeGap}
                </p>
                <button
                  type="button"
                  className="generate-gap-material-button"
                  onClick={() => onKnowledgeGap(evaluation.knowledgeGap!)}
                >
                  Provide Material for This Gap
                </button>
              </>
            )}
            {evaluation.score !== undefined && (
              <p className="practice-score">
                Score: {Math.round(evaluation.score)} / 100
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="exercise-card">
      <p className="exercise-prompt">{exercise.prompt}</p>
      
      {/* Follow-up Question Section */}
      {!evaluation && (
        <div className="follow-up-question-section">
          <label className="follow-up-label">
            Follow up question
            <input
              type="text"
              value={followUpQuestion}
              onChange={(e) => setFollowUpQuestion(e.target.value)}
              placeholder="e.g., ask a follow up question about the exercise"
              className="follow-up-input"
              disabled={isLoadingFollowUp}
            />
          </label>
          {followUpQuestion.trim() && (
            <button
              type="button"
              className="follow-up-button"
              onClick={handleFollowUpQuestion}
              disabled={isLoadingFollowUp}
            >
              {isLoadingFollowUp ? 'Asking...' : 'Ask'}
            </button>
          )}
          {followUpAnswer && (
            <div className="follow-up-answer">
              <p>{followUpAnswer}</p>
            </div>
          )}
        </div>
      )}

      <textarea
        rows={4}
        value={userAnswer}
        onChange={(e) => setUserAnswer(e.target.value)}
        placeholder="Type your answer here..."
        disabled={!!evaluation}
      />
      {!evaluation && (
        <button
          type="button"
          className="secondary-button"
          onClick={handleSubmit}
          disabled={isLoading || !userAnswer.trim()}
        >
          {isLoading ? 'Checking...' : 'Check Answer'}
        </button>
      )}
      {evaluation && (
        <div className="exercise-feedback">
          <p className={evaluation.isCorrect ? 'exercise-feedback--correct' : 'exercise-feedback--incorrect'}>
            {evaluation.feedback}
          </p>
          {evaluation.knowledgeGap && (
            <>
              <p className="practice-gap">
                <strong>Knowledge Gap:</strong> {evaluation.knowledgeGap}
              </p>
              <button
                type="button"
                className="generate-gap-material-button"
                onClick={() => onKnowledgeGap(evaluation.knowledgeGap!)}
              >
                Provide Material for This Gap
              </button>
            </>
          )}
          {evaluation.score !== undefined && (
            <p className="practice-score">
              Score: {Math.round(evaluation.score)} / 100
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [lectures, setLectures] = useState<LectureMap>({})
  const [activeLectureId, setActiveLectureId] = useState<string | null>(null)
  const [form, setForm] = useState<LectureFormState>({
    topic: '',
    goal: '',
    materialsSummary: '',
  })
  const [generationStage, setGenerationStage] = useState<GenerationStage>('idle')
  const [generationError, setGenerationError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [exerciseStates, setExerciseStates] = useState<Record<string, ExerciseState>>(
    {},
  )
  const [exerciseLoading, setExerciseLoading] = useState(false)
  const [exerciseError, setExerciseError] = useState<string | null>(null)
  const loadingLearningSectionsRef = useRef<Set<string>>(new Set())
  const loadedSubchaptersRef = useRef<Set<string>>(new Set())
  
  // New state for on-demand features
  const [generatingExerciseFor, setGeneratingExerciseFor] = useState<Set<string>>(new Set())
  const [generatingGapMaterialFor, setGeneratingGapMaterialFor] = useState<Set<string>>(new Set())
  const [tooltipState, setTooltipState] = useState<{
    sectionId: string
    text: string
    explanation?: string
    position: { x: number; y: number }
  } | null>(null)
  const [explainingSelection, setExplainingSelection] = useState(false)
  const [explanationPopup, setExplanationPopup] = useState<{
    text: string
    explanation: string
  } | null>(null)
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    lectureId: string
    lectureTitle: string
  } | null>(null)
  const [quizExpanded, setQuizExpanded] = useState<Record<string, boolean>>({})

  const activeLecture: Lecture | undefined = useMemo(
    () => (activeLectureId ? lectures[activeLectureId] : undefined),
    [activeLectureId, lectures],
  )

  const activeChapter = useMemo(
    () => getActiveChapter(activeLecture),
    [activeLecture],
  )
  const activeSubchapter = useMemo(
    () => getActiveSubchapter(activeLecture),
    [activeLecture],
  )

  // Check authentication and load lectures on mount
  useEffect(() => {
    let isMounted = true
    
    const initApp = async () => {
      try {
        console.log('Checking authentication on mount...')
        const authStatus = await checkAuth()
        console.log('Auth status:', authStatus)
        
        if (!isMounted) return
        
        if (authStatus.authenticated && authStatus.user) {
          console.log('User authenticated:', authStatus.user.email)
          setUser(authStatus.user)
          
          // Load saved lectures
          try {
            const savedLectures = await loadLectures()
            if (!isMounted) return
            
            const lecturesMap: LectureMap = {}
            savedLectures.forEach((lecture) => {
              lecturesMap[lecture.id] = lecture
            })
            setLectures(lecturesMap)
            setAppState('app')
          } catch (loadErr) {
            console.error('Failed to load lectures:', loadErr)
            if (isMounted) {
              // Still set app state even if lectures fail to load
              setLectures({})
              setAppState('app')
            }
          }
        } else {
          console.log('User not authenticated, showing access code screen')
          if (isMounted) {
            setAppState('access-code')
          }
        }
      } catch (err) {
        console.error('Failed to check auth:', err)
        if (isMounted) {
          setAppState('access-code')
        }
      }
    }
    
    initApp()
    
    return () => {
      isMounted = false
    }
  }, [])

  // Re-check auth when returning from OAuth (e.g., after redirect)
  // Only run when on login/access-code screen, not when already authenticated
  useEffect(() => {
    // Early return - don't run if already authenticated or still loading
    if (appState === 'app' || appState === 'loading') {
      return
    }

    let isMounted = true
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    // Check auth when on login screen (might have just returned from OAuth)
    const checkAuthAfterRedirect = async () => {
      if (!isMounted) return
      
      try {
        console.log('Re-checking auth after redirect, current state:', appState)
        const authStatus = await checkAuth()
        console.log('Re-check auth status:', authStatus)
        
        if (!isMounted) return
        
        if (authStatus.authenticated && authStatus.user) {
          console.log('User authenticated after redirect:', authStatus.user.email)
          setUser(authStatus.user)
          const savedLectures = await loadLectures()
          const lecturesMap: LectureMap = {}
          savedLectures.forEach((lecture) => {
            lecturesMap[lecture.id] = lecture
          })
          setLectures(lecturesMap)
          setAppState('app')
        } else {
          console.log('Still not authenticated after redirect')
        }
      } catch (err) {
        console.error('Failed to re-check auth:', err)
      }
    }

    // Check immediately and also after a delay to ensure session is set after OAuth redirect
    checkAuthAfterRedirect()
    timeoutId = setTimeout(checkAuthAfterRedirect, 1000)
    
    return () => {
      isMounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [appState])

  // Auto-save lectures when they change
  useEffect(() => {
    if (appState !== 'app' || !user) return

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce save - wait 2 seconds after last change
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const lecturesArray = Object.values(lectures)
        for (const lecture of lecturesArray) {
          await saveLecture(lecture)
        }
      } catch (err) {
        console.error('Failed to auto-save:', err)
      }
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [lectures, appState, user])

  const handleAccessCodeVerified = () => {
    setAppState('login')
  }

  const handleLogout = async () => {
    try {
      await apiLogout()
      setUser(null)
      setLectures({})
      setActiveLectureId(null)
      setAppState('access-code')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  const handleGenerateExercise = async (sectionId: string) => {
    if (!activeLecture || !activeChapter || !activeSubchapter) return
    
    const section = activeSubchapter.learningSections.find((s) => s.id === sectionId)
    if (!section) return

    setGeneratingExerciseFor((prev) => new Set(prev).add(sectionId))
    
    try {
      // Get all previous sections (sections before this one)
      const currentIndex = activeSubchapter.learningSections.findIndex((s) => s.id === sectionId)
      const previousSections = activeSubchapter.learningSections.slice(0, currentIndex)

      const response = await generateSectionExercise({
        learningSection: section,
        previousSections,
        goal: activeLecture.goal,
      })

      setLectures((prev) => {
        const current = prev[activeLecture.id]
        if (!current) return prev

        const chapters = current.chapters.map((ch) => {
          if (ch.id !== activeChapter.id) return ch
          return {
            ...ch,
            subchapters: ch.subchapters.map((s) =>
              s.id === activeSubchapter.id
                ? {
                    ...s,
                    learningSections: s.learningSections.map((ls) =>
                      ls.id === sectionId
                        ? { ...ls, generatedExercise: response.exercise }
                        : ls,
                    ),
                  }
                : s,
            ),
          }
        })

        return {
          ...prev,
          [current.id]: {
            ...current,
            chapters,
          },
        }
      })
    } catch (err) {
      console.error('Failed to generate exercise:', err)
      setExerciseError('Could not generate exercise. Try again.')
    } finally {
      setGeneratingExerciseFor((prev) => {
        const next = new Set(prev)
        next.delete(sectionId)
        return next
      })
    }
  }

  const handleGenerateGapMaterial = async (sectionId: string, knowledgeGap: string) => {
    if (!activeLecture || !activeChapter || !activeSubchapter) return
    
    const section = activeSubchapter.learningSections.find((s) => s.id === sectionId)
    if (!section) return

    setGeneratingGapMaterialFor((prev) => new Set(prev).add(sectionId))
    
    try {
      const response = await generateGapMaterial({
        knowledgeGap,
        learningSection: section,
        goal: activeLecture.goal,
      })

      setLectures((prev) => {
        const current = prev[activeLecture.id]
        if (!current) return prev

        const chapters = current.chapters.map((ch) => {
          if (ch.id !== activeChapter.id) return ch
          return {
            ...ch,
            subchapters: ch.subchapters.map((s) =>
              s.id === activeSubchapter.id
                ? {
                    ...s,
                    learningSections: s.learningSections.map((ls) =>
                      ls.id === sectionId
                        ? { ...ls, knowledgeGapMaterial: response.material }
                        : ls,
                    ),
                  }
                : s,
            ),
          }
        })

        return {
          ...prev,
          [current.id]: {
            ...current,
            chapters,
          },
        }
      })
    } catch (err) {
      console.error('Failed to generate gap material:', err)
      setExerciseError('Could not generate material. Try again.')
    } finally {
      setGeneratingGapMaterialFor((prev) => {
        const next = new Set(prev)
        next.delete(sectionId)
        return next
      })
    }
  }

  const handleTextSelection = (sectionId: string) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      // Clear tooltip if selection is cleared
      if (tooltipState) {
        setTooltipState(null)
      }
      return
    }

    const selectedText = selection.toString().trim()
    if (!selectedText || selectedText.length < 2) {
      setTooltipState(null)
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    
    // Check if text is already highlighted
    const subchapter = activeSubchapter
    if (subchapter?.highlightedTexts) {
      const existing = subchapter.highlightedTexts.find(
        (ht) => ht.sectionId === sectionId && ht.text.toLowerCase() === selectedText.toLowerCase(),
      )
      if (existing && existing.explanation) {
        // Re-open popup for existing highlight
        setExplanationPopup({
          text: selectedText,
          explanation: existing.explanation,
        })
        selection.removeAllRanges()
        setTooltipState(null)
        return
      }
    }

    // Show tooltip
    setTooltipState({
      sectionId,
      text: selectedText,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      },
    })
  }

  const handleExplainSelection = async () => {
    if (!tooltipState || !activeLecture || !activeSubchapter) return

    const section = activeSubchapter.learningSections.find((s) => s.id === tooltipState.sectionId)
    if (!section) return

    setExplainingSelection(true)
    try {
      // Get surrounding context (parent element text)
      const response = await explainSelection({
        selectedText: tooltipState.text,
        learningSection: section,
        goal: activeLecture.goal,
      })

      // Store highlighted text with explanation
      const highlightId = `${tooltipState.sectionId}-${Date.now()}`
      const newHighlight: HighlightedText = {
        id: highlightId,
        sectionId: tooltipState.sectionId,
        text: tooltipState.text,
        startOffset: 0, // Simplified - in production would calculate from DOM
        endOffset: tooltipState.text.length,
        explanation: response.explanation,
      }

      setLectures((prev) => {
        const current = prev[activeLecture.id]
        if (!current) return prev

        const chapters = current.chapters.map((ch) => {
          if (ch.id !== activeChapter?.id) return ch
          return {
            ...ch,
            subchapters: ch.subchapters.map((s) =>
              s.id === activeSubchapter.id
                ? {
                    ...s,
                    highlightedTexts: [...(s.highlightedTexts || []), newHighlight],
                  }
                : s,
            ),
          }
        })

        return {
          ...prev,
          [current.id]: {
            ...current,
            chapters,
          },
        }
      })

      // Show popup
      setExplanationPopup({
        text: tooltipState.text,
        explanation: response.explanation,
      })
      setTooltipState(null)
    } catch (err) {
      console.error('Failed to explain selection:', err)
      setTooltipState(null)
    } finally {
      setExplainingSelection(false)
    }
  }

  const handleCloseTooltip = () => {
    setTooltipState(null)
  }

  const handleCloseExplanationPopup = () => {
    setExplanationPopup(null)
    // Clear selection
    window.getSelection()?.removeAllRanges()
  }

  const handleDeleteLecture = async (lectureId: string) => {
    if (!deleteConfirmState || deleteConfirmState.lectureId !== lectureId) {
      const lecture = lectures[lectureId]
      if (lecture) {
        setDeleteConfirmState({
          lectureId,
          lectureTitle: lecture.title,
        })
      }
      return
    }

    try {
      await apiDeleteLecture(lectureId)
      
      // Remove from state
      setLectures((prev) => {
        const next = { ...prev }
        delete next[lectureId]
        return next
      })

      // If deleted lecture was active, switch to another or creation state
      if (activeLectureId === lectureId) {
        const remainingLectures = Object.values(lectures).filter((l) => l.id !== lectureId)
        if (remainingLectures.length > 0) {
          setActiveLectureId(remainingLectures[0].id)
        } else {
          setActiveLectureId(null)
        }
      }

      setDeleteConfirmState(null)
    } catch (err) {
      console.error('Failed to delete lecture:', err)
      setExerciseError('Could not delete lecture. Try again.')
      setDeleteConfirmState(null)
    }
  }

  useEffect(() => {
    const loadLearningContent = async () => {
      if (!activeLecture?.id || !activeChapter?.id || !activeSubchapter?.id) return
      
      const subchapterKey = `${activeLecture.id}-${activeChapter.id}-${activeSubchapter.id}`
      
      // Check if already loaded
      if (loadedSubchaptersRef.current.has(subchapterKey)) {
        return
      }
      
      // Prevent concurrent requests for the same subchapter
      if (loadingLearningSectionsRef.current.has(subchapterKey)) {
        return
      }
      
      // Check actual state from lectures
      const currentLecture = lectures[activeLecture.id]
      if (!currentLecture) return
      
      const currentChapter = currentLecture.chapters.find((ch) => ch.id === activeChapter.id)
      if (!currentChapter) return
      
      const currentSubchapter = currentChapter.subchapters.find((s) => s.id === activeSubchapter.id)
      if (!currentSubchapter) return
      
      // Check if learning sections are already loaded
      const hasLearningSections = currentSubchapter.learningSections.length > 0
      const allSectionsEnhanced = hasLearningSections && 
        currentSubchapter.learningSections.every(
          (section) => section.format && section.hasExerciseButton !== undefined,
        )
      
      // If already fully loaded, mark as loaded and return
      if (hasLearningSections && allSectionsEnhanced) {
        loadedSubchaptersRef.current.add(subchapterKey)
        return
      }
      
      // Mark as loading
      loadingLearningSectionsRef.current.add(subchapterKey)
      setExerciseLoading(true)
      setExerciseError(null)
      
      try {
        // Use new combined endpoint
        const response = await requestLearningSectionsEnhanced({
          subchapterContent: currentSubchapter.content,
          goal: currentLecture.goal,
          subchapterTitle: currentSubchapter.title,
        })
        
        const enhancedSections = response.learningSections

        setLectures((prev) => {
          const current = prev[currentLecture.id]
          if (!current) return prev

          const chapters = current.chapters.map((ch) => {
            if (ch.id !== currentChapter.id) return ch
            return {
              ...ch,
                subchapters: ch.subchapters.map((s) =>
                  s.id === currentSubchapter.id
                    ? {
                        ...s,
                        learningSections: enhancedSections,
                      }
                    : s,
                ),
            }
          })

          return {
            ...prev,
            [current.id]: {
              ...current,
              chapters,
            },
          }
        })
        
        // Mark as loaded
        loadedSubchaptersRef.current.add(subchapterKey)
      } catch (err) {
        console.error(err)
        setExerciseError('Could not load learning sections. Try again.')
      } finally {
        setExerciseLoading(false)
        loadingLearningSectionsRef.current.delete(subchapterKey)
      }
    }

    loadLearningContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLecture?.id, activeChapter?.id, activeSubchapter?.id])

  // Removed automatic quiz exercise loading - now on-demand

  const hasLectures = Object.keys(lectures).length > 0
  const isInCreationState = !hasLectures || !activeLecture

  // Render different screens based on app state
  if (appState === 'loading') {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <span className="logo-mark">SH</span>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (appState === 'access-code') {
    return <AccessCodeScreen onCodeVerified={handleAccessCodeVerified} />
  }

  if (appState === 'login') {
    return <LoginScreen />
  }

  const handleCreateLecture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.topic.trim() || !form.goal.trim()) return

    setGenerationStage('generating')
    setGenerationError(null)

    try {
      const payload: LectureGenerationRequest = {
        topic: form.topic.trim(),
        goal: form.goal.trim(),
        materialsSummary: form.materialsSummary.trim() || undefined,
      }

      const plan = await requestStudyPlan(payload)
      const lecture = createLectureFromPlan(plan, payload)

      setLectures((prev) => {
        const updated = {
          ...prev,
          [lecture.id]: lecture,
        }
        // Auto-save the new lecture
        if (user) {
          saveLecture(lecture).catch(console.error)
        }
        return updated
      })
      setActiveLectureId(lecture.id)
      setGenerationStage('idle')
    } catch (err) {
      console.error(err)
      setGenerationError('Could not generate lecture. Please try again.')
      setGenerationStage('error')
    }
  }

  const handleSelectLecture = (lectureId: string | 'new') => {
    if (lectureId === 'new') {
      setActiveLectureId(null)
      return
    }
    setActiveLectureId(lectureId)
  }

  const handleChapterClick = (chapter: Chapter) => {
    if (!activeLecture) return
    setLectures((prev) => ({
      ...prev,
      [activeLecture.id]: {
        ...activeLecture,
        currentChapterId: chapter.id,
        currentSubchapterId: chapter.subchapters[0]?.id,
      },
    }))
  }

  const handleSubchapterClick = (subchapter: Subchapter) => {
    if (!activeLecture) return
    setLectures((prev) => ({
      ...prev,
      [activeLecture.id]: {
        ...activeLecture,
        currentSubchapterId: subchapter.id,
      },
    }))
    setExerciseStates((prev) => prev)
    setExerciseError(null)
  }


  const handleExerciseAnswerChange = (exercise: Exercise, value: string) => {
    setExerciseStates((prev) => ({
      ...prev,
      [exercise.id]: {
        exerciseId: exercise.id,
        userAnswer: value,
        isCorrect: undefined,
        feedback: undefined,
        knowledgeGap: undefined,
        score: undefined,
        isLoading: false,
      },
    }))
  }

  const handleSubmitExercise = async (exercise: Exercise, valueOverride?: string) => {
    const currentState = exerciseStates[exercise.id]
    const userAnswer = valueOverride ?? currentState?.userAnswer ?? ''
    if (!userAnswer.trim()) return

    if (!activeLecture || !activeSubchapter) return

    setExerciseStates((prev) => ({
      ...prev,
      [exercise.id]: {
        ...(prev[exercise.id] ?? { exerciseId: exercise.id }),
        userAnswer,
        isLoading: true,
      },
    }))

    try {
      const evaluation = await evaluateExercise({
        exercise,
        userAnswer,
        goal: activeLecture.goal,
        subchapterContent: activeSubchapter.content,
      })

      setExerciseStates((prev) => ({
        ...prev,
        [exercise.id]: {
          exerciseId: exercise.id,
          userAnswer,
          isCorrect: evaluation.isCorrect,
          feedback: evaluation.feedback,
          knowledgeGap: evaluation.knowledgeGap,
          score: evaluation.score,
          isLoading: false,
        },
      }))

      if (evaluation.isCorrect) {
        maybeMarkSubchapterComplete()
      }
    } catch (err) {
      console.error(err)
      setExerciseStates((prev) => ({
        ...prev,
        [exercise.id]: {
          exerciseId: exercise.id,
          userAnswer,
          isCorrect: false,
          feedback: 'Could not evaluate right now. Please try again.',
          knowledgeGap: undefined,
          score: undefined,
          isLoading: false,
        },
      }))
    }
  }

  const maybeMarkSubchapterComplete = () => {
    if (!activeLecture || !activeChapter || !activeSubchapter) return

    setLectures((prev) => {
      const current = activeLecture
      if (!current) return prev

      const updatedChapters: Chapter[] = current.chapters.map((ch) => {
        if (ch.id !== activeChapter.id) return ch

        const updatedSubchapters = ch.subchapters.map((s) => {
          if (s.id !== activeSubchapter.id) return s

          return { ...s, isCompleted: true }
        })

        return { ...ch, subchapters: updatedSubchapters }
      })

      // All chapters are now unlocked by default, so no need to update isUnlocked
      const nextLectures: Chapter[] = updatedChapters

      return {
        ...prev,
        [current.id]: {
          ...current,
          chapters: nextLectures,
        },
      }
    })
  }

  const renderLectureSelector = () => {
    const entries = Object.values(lectures).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )

    return (
      <div className="lecture-selector">
        <label className="label">
          Lecture
          <select
            value={activeLectureId ?? 'new'}
            onChange={(e) =>
              handleSelectLecture(e.target.value as string | 'new')
            }
          >
            <option value="new">+ New lecture</option>
            {entries.map((lecture) => (
              <option key={lecture.id} value={lecture.id}>
                {lecture.title}
              </option>
            ))}
          </select>
        </label>
        {activeLectureId && (
          <button
            type="button"
            className="delete-lecture-button"
            onClick={() => handleDeleteLecture(activeLectureId)}
            title="Delete lecture"
          >
            🗑️
          </button>
        )}
      </div>
    )
  }

  const renderCreationState = () => {
    return (
      <div className="creation-state">
        <div className="panel">
          <h1 className="title">StudyHub</h1>
          <p className="subtitle">
            Describe what you want to learn and your goal. StudyHub will draft an
            adaptive lecture roadmap for you.
          </p>

          <form className="form" onSubmit={handleCreateLecture}>
            <label className="label">
              Topic you want to learn
              <input
                type="text"
                value={form.topic}
                onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                placeholder="e.g. Linear algebra for machine learning"
                required
              />
            </label>

            <label className="label">
              Your concrete goal
              <textarea
                value={form.goal}
                onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                placeholder="e.g. Be able to understand and implement basic ML models that rely on matrices and vectors."
                rows={3}
                required
              />
            </label>

            <label className="label">
              Optional: notes about your materials / background
              <textarea
                value={form.materialsSummary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, materialsSummary: e.target.value }))
                }
                placeholder="Paste a short summary of your slides, book, or prior knowledge."
                rows={3}
              />
            </label>

            {generationError && (
              <p className="error-text">{generationError}</p>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={generationStage === 'generating'}
            >
              {generationStage === 'generating'
                ? 'Generating lecture...'
                : 'Generate lecture roadmap'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const renderRoadmap = () => {
    if (!activeLecture) return null

    return (
      <div className="roadmap-layout">
        <aside className="roadmap-sidebar">
          <div className="sidebar-header">
            <h2 className="lecture-title">{activeLecture.title}</h2>
            <p className="goal-text">{activeLecture.goal}</p>
          </div>
          <div className="chapters-list">
            {activeLecture.chapters.map((chapter) => {
              const isActive = activeChapter?.id === chapter.id
              const completedCount = chapter.subchapters.filter(
                (s) => s.isCompleted,
              ).length
              const total = chapter.subchapters.length || 1
              const progressPct = Math.round((completedCount / total) * 100)

              return (
                <button
                  key={chapter.id}
                  className={`chapter-card ${isActive ? 'chapter-card--active' : ''}`}
                  onClick={() => handleChapterClick(chapter)}
                  type="button"
                >
                  <div className="chapter-card-header">
                    <span className="chapter-index">
                      Chapter {activeLecture.chapters.indexOf(chapter) + 1}
                    </span>
                  </div>
                  <div className="chapter-card-title">{chapter.title}</div>
                  <div className="chapter-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="progress-text">
                      {completedCount}/{total} subchapters
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="content-panel">
          {/* Mobile Chapter Selector */}
          {activeLecture.chapters.length > 0 && (
            <div className="mobile-chapter-selector">
              <label className="label">
                Chapter
                <select
                  value={activeChapter?.id || ''}
                  onChange={(e) => {
                    const selectedChapter = activeLecture?.chapters.find(
                      (ch) => ch.id === e.target.value,
                    )
                    if (selectedChapter) {
                      handleChapterClick(selectedChapter)
                    }
                  }}
                >
                  {activeLecture.chapters.map((chapter, index) => (
                    <option
                      key={chapter.id}
                      value={chapter.id}
                    >
                      {`Chapter ${index + 1}: ${chapter.title}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {activeChapter && activeSubchapter ? (
            <>
              <div className="subchapter-header">
                <h2>{activeChapter.title}</h2>
                <p className="subchapter-title">{activeSubchapter.title}</p>
              </div>

              <div className="subchapters-row">
                {activeChapter.subchapters.map((sub) => {
                  const isActive = sub.id === activeSubchapter.id
                  const completed = sub.isCompleted
                  const index =
                    activeChapter.subchapters.findIndex((s) => s.id === sub.id) +
                    1
                  return (
                    <button
                      key={sub.id}
                      className={`subchapter-pill ${
                        isActive ? 'subchapter-pill--active' : ''
                      } ${completed ? 'subchapter-pill--completed' : ''}`}
                      onClick={() => handleSubchapterClick(sub)}
                      type="button"
                    >
                      <span className="subchapter-pill-index">{index}</span>
                      <span className="subchapter-pill-label">
                        {sub.title}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Introduction Section */}
              <section 
                className="subchapter-content"
                onMouseUp={() => handleTextSelection('introduction')}
              >
                <h3>Introduction</h3>
                <TextWithHighlights
                  text={activeSubchapter.content}
                  sectionId="introduction"
                  highlightedTexts={activeSubchapter.highlightedTexts || []}
                  onHighlightClick={(text, explanation) => {
                    setExplanationPopup({ text, explanation })
                  }}
                />
              </section>

              {/* Learning Sections */}
              {exerciseLoading && activeSubchapter.learningSections.length === 0 && (
                <section className="learning-sections">
                  <h3>Learning Materials</h3>
                  <p className="exercise-hint">Loading learning materials…</p>
                </section>
              )}
              {activeSubchapter.learningSections.length > 0 && (
                <section className="learning-sections">
                  <h3>Learning Materials</h3>
                  {activeSubchapter.learningSections.map((section) => (
                    <div key={section.id} className="learning-section">
                      <h4>{section.title}</h4>
                      <span className="format-badge">{section.format}</span>

                      {/* Explanation with text highlighting */}
                      <div 
                        className="section-explanation"
                        onMouseUp={() => handleTextSelection(section.id)}
                      >
                        <TextWithHighlights
                          text={section.content.explanation}
                          sectionId={section.id}
                          highlightedTexts={activeSubchapter.highlightedTexts || []}
                          onHighlightClick={(text, explanation) => {
                            setExplanationPopup({ text, explanation })
                          }}
                        />
                      </div>

                      {/* Process (for process/framework/method) */}
                      {section.content.process &&
                        section.content.process.length > 0 && (
                          <div 
                            className="section-process"
                            onMouseUp={() => handleTextSelection(section.id)}
                          >
                            <h5>Process:</h5>
                            <ol className="process-steps">
                              {section.content.process.map((step, idx) => (
                                <li key={idx}>
                                  <TextWithHighlights
                                    text={step}
                                    sectionId={section.id}
                                    highlightedTexts={activeSubchapter.highlightedTexts || []}
                                    onHighlightClick={(text, explanation) => {
                                      setExplanationPopup({ text, explanation })
                                    }}
                                  />
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                      {/* Components (for framework) */}
                      {section.content.components &&
                        section.content.components.length > 0 && (
                          <div 
                            className="section-components"
                            onMouseUp={() => handleTextSelection(section.id)}
                          >
                            <h5>Components:</h5>
                            <ul className="components-list">
                              {section.content.components.map((comp, idx) => (
                                <li key={idx}>
                                  <strong>{comp.name}:</strong>{' '}
                                  <TextWithHighlights
                                    text={comp.description}
                                    sectionId={section.id}
                                    highlightedTexts={activeSubchapter.highlightedTexts || []}
                                    onHighlightClick={(text, explanation) => {
                                      setExplanationPopup({ text, explanation })
                                    }}
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Comparison Points (for comparison) */}
                      {section.content.comparisonPoints &&
                        section.content.comparisonPoints.length > 0 && (
                          <div 
                            className="section-comparison"
                            onMouseUp={() => handleTextSelection(section.id)}
                          >
                            <h5>Comparison:</h5>
                            <ul className="comparison-list">
                              {section.content.comparisonPoints.map((point, idx) => (
                                <li key={idx}>
                                  <strong>{point.aspect}:</strong>{' '}
                                  <TextWithHighlights
                                    text={point.details}
                                    sectionId={section.id}
                                    highlightedTexts={activeSubchapter.highlightedTexts || []}
                                    onHighlightClick={(text, explanation) => {
                                      setExplanationPopup({ text, explanation })
                                    }}
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Example */}
                      {section.content.example && (
                        <div 
                          className="section-example"
                          onMouseUp={() => handleTextSelection(section.id)}
                        >
                          <h5>Example:</h5>
                          <TextWithHighlights
                            text={section.content.example}
                            sectionId={section.id}
                            highlightedTexts={activeSubchapter.highlightedTexts || []}
                            onHighlightClick={(text, explanation) => {
                              setExplanationPopup({ text, explanation })
                            }}
                          />
                        </div>
                      )}

                      {/* Generate Exercise Button - Always show for method, process, or concept */}
                      {!section.generatedExercise && 
                       (section.hasExerciseButton || 
                        section.format === 'method' || 
                        section.format === 'process' || 
                        section.format === 'concept') && (
                        <div className="section-actions">
                          <button
                            type="button"
                            className="generate-exercise-button"
                            onClick={() => handleGenerateExercise(section.id)}
                            disabled={generatingExerciseFor.has(section.id)}
                          >
                            {generatingExerciseFor.has(section.id)
                              ? 'Generating...'
                              : 'Generate Exercise'}
                          </button>
                        </div>
                      )}

                      {/* Generated Exercise */}
                      {section.generatedExercise && activeLecture && activeSubchapter && (
                        <div className="generated-exercise">
                          <h5>Exercise:</h5>
                          <ExerciseCard
                            exercise={section.generatedExercise}
                            learningSection={section}
                            goal={activeLecture.goal}
                            onKnowledgeGap={(gap) => handleGenerateGapMaterial(section.id, gap)}
                            onEvaluate={async (exercise, userAnswer) => {
                              const result = await evaluateExercise({
                                exercise,
                                userAnswer,
                                goal: activeLecture.goal,
                                subchapterContent: activeSubchapter.content,
                              })
                              return result
                            }}
                          />
                        </div>
                      )}

                      {/* Knowledge Gap Material */}
                      {section.knowledgeGapMaterial && (
                        <div className="gap-material">
                          <h5>Additional Material:</h5>
                          <p>{section.knowledgeGapMaterial}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* Quiz Section - Now empty by default, exercises generated on-demand per section */}
              {activeSubchapter.exercises.length > 0 && (
                <section className="exercises-section">
                  <div className="quiz-header">
                    <h3>Quiz</h3>
                    <button
                      type="button"
                      className="quiz-toggle-button"
                      onClick={() => {
                        const subchapterKey = activeSubchapter.id
                        setQuizExpanded((prev) => ({
                          ...prev,
                          [subchapterKey]: !prev[subchapterKey],
                        }))
                      }}
                    >
                      {quizExpanded[activeSubchapter.id] ? '▼ Collapse' : '▶ Expand'}
                    </button>
                  </div>
                  {quizExpanded[activeSubchapter.id] && (
                    <>
                      <p className="exercise-hint">
                        Test your understanding with these exercises. No explanations are
                        provided—answer based on what you learned above.
                      </p>
                      {exerciseError && <p className="error-text">{exerciseError}</p>}
                      {activeSubchapter.exercises.map((exercise) => {
                  const state = exerciseStates[exercise.id]

                  if (exercise.type === 'open-ended') {
                    return (
                      <div
                        key={exercise.id}
                        className="exercise-card exercise-card--open"
                      >
                        <h4>Open-ended Question</h4>
                        <p className="exercise-prompt">{exercise.prompt}</p>
                        <textarea
                          rows={4}
                          value={state?.userAnswer ?? ''}
                          onChange={(e) =>
                            handleExerciseAnswerChange(exercise, e.target.value)
                          }
                          placeholder="Type your answer here..."
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handleSubmitExercise(exercise)}
                          disabled={state?.isLoading}
                        >
                          {state?.isLoading ? 'Checking...' : 'Check answer'}
                        </button>
                        {state?.feedback && (
                          <p
                            className={`exercise-feedback ${
                              state.isCorrect
                                ? 'exercise-feedback--correct'
                                : 'exercise-feedback--incorrect'
                            }`}
                          >
                            {state.feedback}
                          </p>
                        )}
                        {state?.knowledgeGap && (
                          <>
                            <p className="practice-gap">
                              <strong>Knowledge Gap:</strong> {state.knowledgeGap}
                            </p>
                            {!activeSubchapter.knowledgeGapMaterial && (
                              <button
                                type="button"
                                className="generate-gap-material-button"
                              onClick={() => {
                                // For quiz exercises, we'll create a generic learning section for the gap
                                if (activeSubchapter && activeLecture && state.knowledgeGap) {
                                  const gapSectionId = `gap-${exercise.id}`
                                  handleGenerateGapMaterial(gapSectionId, state.knowledgeGap)
                                }
                              }}
                                disabled={generatingGapMaterialFor.has(`gap-${exercise.id}`)}
                              >
                                {generatingGapMaterialFor.has(`gap-${exercise.id}`)
                                  ? 'Generating...'
                                  : 'Provide Material for This Gap'}
                              </button>
                            )}
                            {activeSubchapter.knowledgeGapMaterial && (
                              <div className="gap-material">
                                <p>{activeSubchapter.knowledgeGapMaterial}</p>
                              </div>
                            )}
                          </>
                        )}
                        {typeof state?.score === 'number' && (
                          <p className="exercise-feedback">
                            Score: {Math.round(state.score ?? 0)} / 100
                          </p>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div
                      key={exercise.id}
                      className="exercise-card exercise-card--mcq"
                    >
                      <h4>Multiple Choice Question</h4>
                      <p className="exercise-prompt">{exercise.prompt}</p>
                      <div className="mcq-options">
                        {exercise.options?.map((opt) => {
                          const isSelected = state?.userAnswer === opt.id
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              className={`mcq-option ${
                                isSelected ? 'mcq-option--selected' : ''
                              }`}
                              onClick={() => {
                                handleExerciseAnswerChange(exercise, opt.id)
                                handleSubmitExercise(exercise, opt.id)
                              }}
                              disabled={state?.isLoading}
                            >
                              <span className="mcq-option-label">
                                {opt.id.toUpperCase()}.
                              </span>
                              <span>{opt.text}</span>
                            </button>
                          )
                        })}
                      </div>
                      {state?.feedback && (
                        <p
                          className={`exercise-feedback ${
                            state.isCorrect
                              ? 'exercise-feedback--correct'
                              : 'exercise-feedback--incorrect'
                          }`}
                        >
                          {state.feedback}
                        </p>
                      )}
                      {state?.knowledgeGap && (
                        <>
                          <p className="practice-gap">
                            <strong>Knowledge Gap:</strong> {state.knowledgeGap}
                          </p>
                          {!activeSubchapter.knowledgeGapMaterial && (
                            <button
                              type="button"
                              className="generate-gap-material-button"
                              onClick={() => {
                                // For quiz exercises, we'll create a generic learning section for the gap
                                if (activeSubchapter && activeLecture && state.knowledgeGap) {
                                  const gapSectionId = `gap-${exercise.id}`
                                  handleGenerateGapMaterial(gapSectionId, state.knowledgeGap)
                                }
                              }}
                              disabled={generatingGapMaterialFor.has(`gap-${exercise.id}`)}
                            >
                              {generatingGapMaterialFor.has(`gap-${exercise.id}`)
                                ? 'Generating...'
                                : 'Provide Material for This Gap'}
                            </button>
                          )}
                          {activeSubchapter.knowledgeGapMaterial && (
                            <div className="gap-material">
                              <p>{activeSubchapter.knowledgeGapMaterial}</p>
                            </div>
                          )}
                        </>
                      )}
                      {typeof state?.score === 'number' && (
                        <p className="exercise-feedback">
                          Score: {Math.round(state.score ?? 0)} / 100
                        </p>
                      )}
                    </div>
                  )
                })}
                    </>
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="empty-state">
              <h2>Select a chapter to get started</h2>
              <p>
                Choose any chapter to begin learning.
              </p>
            </div>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <span className="logo-mark">SH</span>
          <span className="app-name">StudyHub</span>
        </div>
        <div className="app-header-right">
          {user && (
            <div className="user-info">
              {user.picture && (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="user-avatar"
                />
              )}
              <span className="user-name">{user.name}</span>
            </div>
          )}
          {renderLectureSelector()}
          {user && (
            <button
              className="logout-button"
              onClick={handleLogout}
              title="Logout"
            >
              Logout
            </button>
          )}
        </div>
      </header>
      <div className="app-body">
        {isInCreationState ? renderCreationState() : renderRoadmap()}
      </div>

      {/* Tooltip for text selection */}
      {tooltipState && (
        <div
          className="tooltip-button"
          style={{
            position: 'fixed',
            left: `${tooltipState.position.x}px`,
            top: `${tooltipState.position.y}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            onClick={handleExplainSelection}
            onBlur={handleCloseTooltip}
            disabled={explainingSelection}
          >
            {explainingSelection ? (
              <span className="loading-spinner-container">
                <span className="loading-spinner"></span>
                <span>Loading...</span>
              </span>
            ) : (
              'Explain this'
            )}
          </button>
        </div>
      )}

      {/* Explanation Popup */}
      {explanationPopup && (
        <div className="explanation-popup-overlay" onClick={handleCloseExplanationPopup}>
          <div className="explanation-popup" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="explanation-popup-close"
              onClick={handleCloseExplanationPopup}
            >
              ×
            </button>
            <h4>Explanation</h4>
            <p className="explanation-popup-text">{explanationPopup.text}</p>
            <div className="explanation-popup-content">
              {explanationPopup.explanation}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmState && (
        <div className="confirmation-modal-overlay" onClick={() => setDeleteConfirmState(null)}>
          <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Lecture</h3>
            <p>
              Are you sure you want to delete "{deleteConfirmState.lectureTitle}"? This action
              cannot be undone.
            </p>
            <div className="confirmation-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteConfirmState(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-lecture-confirm-button"
                onClick={() => handleDeleteLecture(deleteConfirmState.lectureId)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

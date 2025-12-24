import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  evaluateExercise,
  evaluatePracticeExercise,
  requestLearningSections,
  enhanceLearningSections,
  refinePracticeExercises,
  requestExercises,
  requestStudyPlan,
  checkAuth,
  logout as apiLogout,
  saveLecture,
  loadLectures,
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
  const chapters: Chapter[] = plan.chapters.map((ch, idx) => {
    const subchapters: Subchapter[] = ch.subchapters.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      learningSections: [], // will be populated lazily when user opens subchapter
      exercises: [], // will be populated lazily when user opens subchapter
      isCompleted: false,
    }))

    return {
      id: ch.id,
      title: ch.title,
      subchapters,
      isUnlocked: idx === 0, // only first chapter unlocked initially
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
  const [practiceExerciseStates, setPracticeExerciseStates] = useState<
    Record<string, { userAnswer: string; isLoading: boolean }>
  >({})
  const [exerciseLoading, setExerciseLoading] = useState(false)
  const [exerciseError, setExerciseError] = useState<string | null>(null)
  const loadingLearningSectionsRef = useRef<Set<string>>(new Set())
  const loadedSubchaptersRef = useRef<Set<string>>(new Set())

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
    const initApp = async () => {
      try {
        const authStatus = await checkAuth()
        if (authStatus.authenticated && authStatus.user) {
          setUser(authStatus.user)
          // Load saved lectures
          const savedLectures = await loadLectures()
          const lecturesMap: LectureMap = {}
          savedLectures.forEach((lecture) => {
            lecturesMap[lecture.id] = lecture
          })
          setLectures(lecturesMap)
          setAppState('app')
        } else {
          setAppState('access-code')
        }
      } catch (err) {
        console.error('Failed to check auth:', err)
        setAppState('access-code')
      }
    }
    initApp()
  }, [])

  // Re-check auth when returning from OAuth (e.g., after redirect)
  useEffect(() => {
    if (appState === 'app' || appState === 'loading') return

    // Check auth when on login screen (might have just returned from OAuth)
    const checkAuthAfterRedirect = async () => {
      try {
        const authStatus = await checkAuth()
        if (authStatus.authenticated && authStatus.user) {
          setUser(authStatus.user)
          const savedLectures = await loadLectures()
          const lecturesMap: LectureMap = {}
          savedLectures.forEach((lecture) => {
            lecturesMap[lecture.id] = lecture
          })
          setLectures(lecturesMap)
          setAppState('app')
        }
      } catch (err) {
        // Silently fail - user is not authenticated yet
      }
    }

    // Small delay to ensure session is set after OAuth redirect
    const timeout = setTimeout(checkAuthAfterRedirect, 500)
    
    return () => clearTimeout(timeout)
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
    if (!chapter.isUnlocked || !activeLecture) return
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
      
      // Check if learning sections are already fully loaded (with format and practice exercises)
      const hasLearningSections = currentSubchapter.learningSections.length > 0
      const allSectionsEnhanced = hasLearningSections && 
        currentSubchapter.learningSections.every(
          (section) => section.format && section.practiceExercises && section.practiceExercises.length > 0,
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
        let enhancedSections: typeof currentSubchapter.learningSections
        
        if (hasLearningSections && !allSectionsEnhanced) {
          // Enhance existing sections
          const enhancementResponse = await enhanceLearningSections({
            learningSections: currentSubchapter.learningSections,
            goal: currentLecture.goal,
            subchapterTitle: currentSubchapter.title,
          })
          enhancedSections = enhancementResponse.learningSections
        } else {
          // Load sections first, then enhance them
          const learningResponse = await requestLearningSections({
            subchapterContent: currentSubchapter.content,
            goal: currentLecture.goal,
            subchapterTitle: currentSubchapter.title,
          })

          const enhancementResponse = await enhanceLearningSections({
            learningSections: learningResponse.learningSections.map((s) => ({
              id: s.id,
              title: s.title,
              content: {
                explanation: typeof s.content === 'string' ? s.content : s.content.explanation || '',
              },
              format: 'concept' as const,
              practiceExercises: [],
            })),
            goal: currentLecture.goal,
            subchapterTitle: currentSubchapter.title,
          })
          enhancedSections = enhancementResponse.learningSections
        }

        // Refine practice exercises for each section to make them more specific and actionable
        enhancedSections = await Promise.all(
          enhancedSections.map(async (section) => {
            if (!section.practiceExercises || section.practiceExercises.length === 0) {
              return section
            }

            try {
              const refinementResponse = await refinePracticeExercises({
                exercises: section.practiceExercises,
                learningSection: section,
                goal: currentLecture.goal,
              })

              return {
                ...section,
                practiceExercises: refinementResponse.exercises,
              }
            } catch (err) {
              console.error('Failed to refine practice exercises for section', section.id, err)
              return section
            }
          }),
        )

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

  useEffect(() => {
    const loadExercisesAfterLearning = async () => {
      if (!activeLecture || !activeChapter || !activeSubchapter) return
      if (activeSubchapter.exercises.length > 0) return
      if (activeSubchapter.learningSections.length === 0) return

      setExerciseLoading(true)
      setExerciseError(null)
      try {
        const exercises = await requestExercises({
          lectureTitle: activeLecture.title,
          chapterTitle: activeChapter.title,
          subchapterTitle: activeSubchapter.title,
          subchapterContent: activeSubchapter.content,
          goal: activeLecture.goal,
          learningSections: activeSubchapter.learningSections,
        })

        setLectures((prev) => {
          const current = activeLecture
          if (!current) return prev

          const chapters = current.chapters.map((ch) => {
            if (ch.id !== activeChapter.id) return ch
            return {
              ...ch,
              subchapters: ch.subchapters.map((s) =>
                s.id === activeSubchapter.id
                  ? {
                      ...s,
                      exercises,
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
        console.error(err)
        setExerciseError('Could not load exercises. Try again.')
      } finally {
        setExerciseLoading(false)
      }
    }

    loadExercisesAfterLearning()
  }, [
    activeLecture?.id,
    activeChapter?.id,
    activeSubchapter?.id,
    activeSubchapter?.learningSections.length,
  ])

  const handlePracticeExerciseChange = (
    sectionId: string,
    exerciseId: string,
    value: string,
  ) => {
    setPracticeExerciseStates((prev) => ({
      ...prev,
      [`${sectionId}-${exerciseId}`]: {
        userAnswer: value,
        isLoading: false,
      },
    }))
  }

  const handleSubmitPracticeExercise = async (
    section: import('./types').LearningSection,
    exercise: import('./types').PracticeExercise,
  ) => {
    if (!activeLecture || !activeSubchapter) return

    const key = `${section.id}-${exercise.id}`
    const currentAnswer = practiceExerciseStates[key]?.userAnswer || ''
    if (!currentAnswer.trim()) return

    setPracticeExerciseStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], isLoading: true },
    }))

    try {
      const evaluation = await evaluatePracticeExercise({
        exercise,
        userAnswer: currentAnswer,
        learningSection: section,
        goal: activeLecture.goal,
      })

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
                    learningSections: s.learningSections.map((ls) =>
                      ls.id === section.id
                        ? {
                            ...ls,
                            practiceExercises: ls.practiceExercises.map((pe) =>
                              pe.id === exercise.id
                                ? {
                                    ...pe,
                                    userAnswer: currentAnswer,
                                    evaluation: {
                                      feedback: evaluation.feedback,
                                      score: evaluation.score,
                                      knowledgeGap: evaluation.knowledgeGap,
                                    },
                                  }
                                : pe,
                            ),
                          }
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

      setPracticeExerciseStates((prev) => ({
        ...prev,
        [key]: { ...prev[key], isLoading: false },
      }))
    } catch (err) {
      console.error(err)
      setPracticeExerciseStates((prev) => ({
        ...prev,
        [key]: { ...prev[key], isLoading: false },
      }))
    }
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

      const nextLectures: Chapter[] = updatedChapters.map((ch, chIdx) => {
        if (ch.id === activeChapter.id) return { ...ch, isUnlocked: true }
        if (
          chIdx > current.chapters.findIndex((c) => c.id === activeChapter.id)
        ) {
          const allPrevCompleted = updatedChapters[chIdx - 1].subchapters.every(
            (s) => s.isCompleted,
          )
          return { ...ch, isUnlocked: ch.isUnlocked || allPrevCompleted }
        }
        return ch
      })

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
                  className={`chapter-card ${
                    !chapter.isUnlocked ? 'chapter-card--locked' : ''
                  } ${isActive ? 'chapter-card--active' : ''}`}
                  onClick={() => handleChapterClick(chapter)}
                  disabled={!chapter.isUnlocked}
                  type="button"
                >
                  <div className="chapter-card-header">
                    <span className="chapter-index">
                      Chapter {activeLecture.chapters.indexOf(chapter) + 1}
                    </span>
                    {!chapter.isUnlocked && <span className="chip">Locked</span>}
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
              <section className="subchapter-content">
                <h3>Introduction</h3>
                <p>{activeSubchapter.content}</p>
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

                      {/* Explanation */}
                      <div className="section-explanation">
                        <p>{section.content.explanation}</p>
                      </div>

                      {/* Process (for process/framework/method) */}
                      {section.content.process &&
                        section.content.process.length > 0 && (
                          <div className="section-process">
                            <h5>Process:</h5>
                            <ol className="process-steps">
                              {section.content.process.map((step, idx) => (
                                <li key={idx}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}

                      {/* Components (for framework) */}
                      {section.content.components &&
                        section.content.components.length > 0 && (
                          <div className="section-components">
                            <h5>Components:</h5>
                            <ul className="components-list">
                              {section.content.components.map((comp, idx) => (
                                <li key={idx}>
                                  <strong>{comp.name}:</strong> {comp.description}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Comparison Points (for comparison) */}
                      {section.content.comparisonPoints &&
                        section.content.comparisonPoints.length > 0 && (
                          <div className="section-comparison">
                            <h5>Comparison:</h5>
                            <ul className="comparison-list">
                              {section.content.comparisonPoints.map((point, idx) => (
                                <li key={idx}>
                                  <strong>{point.aspect}:</strong> {point.details}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Example */}
                      {section.content.example && (
                        <div className="section-example">
                          <h5>Example:</h5>
                          <p className="example-text">{section.content.example}</p>
                        </div>
                      )}

                      {/* Practice Exercises */}
                      {section.practiceExercises &&
                        section.practiceExercises.length > 0 && (
                          <div className="practice-exercises">
                            <h5>Practice:</h5>
                            {section.practiceExercises.map((exercise) => {
                              const practiceKey = `${section.id}-${exercise.id}`
                              const practiceState = practiceExerciseStates[practiceKey]
                              const userAnswer =
                                exercise.userAnswer || practiceState?.userAnswer || ''
                              const isLoading = practiceState?.isLoading || false

                              return (
                                <div key={exercise.id} className="practice-exercise">
                                  <p className="practice-prompt">{exercise.prompt}</p>
                                  {exercise.exampleScenario && (
                                    <p className="practice-scenario">
                                      <strong>Scenario:</strong> {exercise.exampleScenario}
                                    </p>
                                  )}
                                  <textarea
                                    rows={4}
                                    value={userAnswer}
                                    onChange={(e) =>
                                      handlePracticeExerciseChange(
                                        section.id,
                                        exercise.id,
                                        e.target.value,
                                      )
                                    }
                                    placeholder="Type your answer here..."
                                    disabled={!!exercise.evaluation}
                                  />
                                  {!exercise.evaluation && (
                                    <button
                                      type="button"
                                      className="secondary-button"
                                      onClick={() =>
                                        handleSubmitPracticeExercise(section, exercise)
                                      }
                                      disabled={isLoading || !userAnswer.trim()}
                                    >
                                      {isLoading ? 'Checking...' : 'Check Answer'}
                                    </button>
                                  )}
                                  {exercise.evaluation && (
                                    <div className="practice-evaluation">
                                      <p className="practice-feedback">
                                        {exercise.evaluation.feedback}
                                      </p>
                                      <p className="practice-score">
                                        Score: {Math.round(exercise.evaluation.score)} / 100
                                      </p>
                                      {exercise.evaluation.knowledgeGap && (
                                        <p className="practice-gap">
                                          <strong>Knowledge Gap:</strong>{' '}
                                          {exercise.evaluation.knowledgeGap}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                    </div>
                  ))}
                </section>
              )}

              {/* Quiz Section */}
              <section className="exercises-section">
                <h3>Quiz</h3>
                <p className="exercise-hint">
                  Test your understanding with these exercises. No explanations are
                  provided—answer based on what you learned above.
                </p>
                {exerciseLoading && activeSubchapter.exercises.length === 0 && (
                  <p className="exercise-hint">Loading quiz questions…</p>
                )}
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
                          <p className="exercise-feedback">
                            Knowledge gap: {state.knowledgeGap}
                          </p>
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
                        <p className="exercise-feedback">
                          Knowledge gap: {state.knowledgeGap}
                        </p>
                      )}
                      {typeof state?.score === 'number' && (
                        <p className="exercise-feedback">
                          Score: {Math.round(state.score ?? 0)} / 100
                        </p>
                      )}
                    </div>
                  )
                })}
              </section>
            </>
          ) : (
            <div className="empty-state">
              <h2>Select a chapter to get started</h2>
              <p>
                Begin with the first unlocked chapter and work your way through the
                subchapters.
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
    </div>
  )
}

export default App

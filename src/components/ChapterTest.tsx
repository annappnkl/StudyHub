import { useState, useEffect } from 'react'
import type { 
  ChapterTest, 
  TestAnswer, 
  ChapterTestResult,
  GenerateChapterTestRequest,
  EvaluateChapterTestRequest,
  EvaluateChapterTestResponse,
  Chapter,
  Subchapter,
  LearningSection
} from '../types'

interface ChapterTestProps {
  chapter: Chapter & {
    subchapters: (Subchapter & {
      learningSections: LearningSection[]
    })[]
  }
  goal: string
  userExerciseHistory?: Array<{
    sectionTitle: string
    success: boolean
    score?: number
  }>
  assessmentResults?: Array<{
    skillName: string
    knowledgeLevel: 'beginner' | 'intermediate' | 'advanced'
    assessmentScore: number
  }>
  onTestComplete: (results: ChapterTestResult) => void
  onGenerateTest: (request: GenerateChapterTestRequest) => Promise<{ test: ChapterTest }>
  onEvaluateTest: (request: EvaluateChapterTestRequest) => Promise<EvaluateChapterTestResponse>
  onClose: () => void
}

export function ChapterTest({
  chapter,
  goal,
  userExerciseHistory,
  assessmentResults,
  onTestComplete,
  onGenerateTest,
  onEvaluateTest,
  onClose
}: ChapterTestProps) {
  const [testState, setTestState] = useState<'generating' | 'ready' | 'in-progress' | 'completed'>('generating')
  const [test, setTest] = useState<ChapterTest | null>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<TestAnswer[]>([])
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Initialize test generation
  useEffect(() => {
    const initializeTest = async () => {
      try {
        setError(null)
        const response = await onGenerateTest({
          chapterData: chapter,
          userExerciseHistory,
          assessmentResults,
          goal
        })
        
        setTest(response.test)
        setTestState('ready')
      } catch (err) {
        console.error('Failed to generate test:', err)
        setError(err instanceof Error ? err.message : 'Failed to generate test')
        setTestState('ready') // Allow retry
      }
    }

    initializeTest()
  }, [chapter, goal, userExerciseHistory, assessmentResults, onGenerateTest])

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    
    if (testState === 'in-progress' && startTime) {
      interval = setInterval(() => {
        setTimeElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000))
      }, 1000)
    }
    
    return () => clearInterval(interval)
  }, [testState, startTime])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleStartTest = () => {
    if (!test) return
    
    setTestState('in-progress')
    setStartTime(new Date())
    setCurrentQuestionIndex(0)
    setAnswers([])
  }

  const handleAnswerChange = (questionId: string, answer: string, selectedOptionId?: string) => {
    setAnswers(prev => {
      const existing = prev.find(a => a.questionId === questionId)
      const newAnswer: TestAnswer = {
        questionId,
        userAnswer: answer,
        selectedOptionId,
        score: 0, // Will be calculated during evaluation
        maxScore: test?.questions.find(q => q.id === questionId)?.maxPoints || 0,
        feedback: '', // Will be provided during evaluation
        isCorrect: undefined // Will be determined during evaluation
      }
      
      if (existing) {
        return prev.map(a => a.questionId === questionId ? newAnswer : a)
      } else {
        return [...prev, newAnswer]
      }
    })
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < (test?.questions.length || 0) - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    }
  }

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1)
    }
  }

  const handleCompleteTest = async () => {
    if (!test || !startTime) return

    const endTime = new Date()
    const timeSpentMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000)

    setTestState('completed')

    try {
      // Evaluate the test using the backend API
      const evaluationResponse = await onEvaluateTest({
        test,
        answers,
        timeSpentMinutes,
        goal,
        userAssessmentResults: assessmentResults
      })

      // Create test result with evaluation data
      const testResult: ChapterTestResult = {
        testId: test.id,
        userId: 'current-user', // Would come from auth context
        completedAt: endTime.toISOString(),
        answers: evaluationResponse.answers.map((evalAnswer) => {
          const originalAnswer = answers.find(a => a.questionId === evalAnswer.questionId)
          return {
            questionId: evalAnswer.questionId,
            userAnswer: originalAnswer?.userAnswer || '',
            selectedOptionId: originalAnswer?.selectedOptionId,
            score: evalAnswer.score,
            maxScore: evalAnswer.maxScore,
            feedback: evalAnswer.feedback,
            isCorrect: evalAnswer.isCorrect
          }
        }),
        totalScore: evaluationResponse.totalScore,
        maxScore: evaluationResponse.maxScore,
        percentageScore: evaluationResponse.percentageScore,
        timeSpentMinutes,
        feedback: {
          overallPerformance: evaluationResponse.overallFeedback.overallPerformance,
          strengths: evaluationResponse.overallFeedback.strengths,
          areasForImprovement: evaluationResponse.overallFeedback.areasForImprovement,
          recommendedActions: evaluationResponse.overallFeedback.recommendedActions,
          masteryLevel: evaluationResponse.overallFeedback.masteryLevel
        }
      }

      onTestComplete(testResult)
    } catch (error) {
      console.error('Failed to evaluate test:', error)
      
      // Fallback test result if evaluation fails
      const fallbackResult: ChapterTestResult = {
        testId: test.id,
        userId: 'current-user',
        completedAt: endTime.toISOString(),
        answers,
        totalScore: 0,
        maxScore: test.totalPoints,
        percentageScore: 0,
        timeSpentMinutes,
        feedback: {
          overallPerformance: 'Test completed - evaluation failed. Please try again.',
          strengths: ['Completed the test'],
          areasForImprovement: ['Evaluation could not be completed'],
          recommendedActions: ['Contact support if this issue persists'],
          masteryLevel: 'intermediate'
        }
      }

      onTestComplete(fallbackResult)
    }
  }

  const currentQuestion = test?.questions[currentQuestionIndex]
  const currentAnswer = answers.find(a => a.questionId === currentQuestion?.id)

  if (error && !test) {
    return (
      <div className="chapter-test-container">
        <div className="test-header">
          <h2>Chapter Test - {chapter.title}</h2>
          <button onClick={onClose} className="close-test-button">✕</button>
        </div>
        <div className="test-error">
          <p>Failed to generate test: {error}</p>
          <button onClick={() => window.location.reload()} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (testState === 'generating') {
    return (
      <div className="chapter-test-container">
        <div className="test-header">
          <h2>Chapter Test - {chapter.title}</h2>
          <button onClick={onClose} className="close-test-button">✕</button>
        </div>
        <div className="test-loading">
          <div className="loading-spinner"></div>
          <h3>Generating Your Personalized Test...</h3>
          <p>Creating comprehensive questions based on your learning progress and knowledge level.</p>
        </div>
      </div>
    )
  }

  if (testState === 'ready' && test) {
    return (
      <div className="chapter-test-container">
        <div className="test-header">
          <h2>Chapter Test - {chapter.title}</h2>
          <button onClick={onClose} className="close-test-button">✕</button>
        </div>
        
        <div className="test-overview">
          <h3>{test.title}</h3>
          <div className="test-stats">
            <div className="test-stat">
              <span className="stat-label">Questions:</span>
              <span className="stat-value">{test.questions.length}</span>
            </div>
            <div className="test-stat">
              <span className="stat-label">Estimated Time:</span>
              <span className="stat-value">{test.estimatedTimeMinutes} minutes</span>
            </div>
            <div className="test-stat">
              <span className="stat-label">Total Points:</span>
              <span className="stat-value">{test.totalPoints}</span>
            </div>
          </div>
          
          {test.adaptedForUser && (
            <div className="adaptation-notice">
              <h4>🎯 Personalized for You</h4>
              <p>{test.adaptedForUser.difficultyAdjustments}</p>
              {test.adaptedForUser.focusedOnWeakAreas.length > 0 && (
                <p>
                  <strong>Focus areas:</strong> {test.adaptedForUser.focusedOnWeakAreas.join(', ')}
                </p>
              )}
            </div>
          )}
          
          <div className="test-instructions">
            <h4>Instructions:</h4>
            <ul>
              <li>Answer all questions to the best of your ability</li>
              <li>For scenario-based questions, provide detailed analysis</li>
              <li>You can navigate between questions and change answers</li>
              <li>Submit when you're ready - there's no time limit</li>
            </ul>
          </div>
          
          <button onClick={handleStartTest} className="start-test-button">
            Start Test
          </button>
        </div>
      </div>
    )
  }

  if (testState === 'in-progress' && test && currentQuestion) {
    return (
      <div className="chapter-test-container">
        <div className="test-header">
          <h2>Chapter Test - {chapter.title}</h2>
          <div className="test-progress">
            <span>Question {currentQuestionIndex + 1} of {test.questions.length}</span>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${((currentQuestionIndex + 1) / test.questions.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="test-timer">
            ⏱️ {formatTime(timeElapsed)}
          </div>
        </div>
        
        <div className="test-content">
          <div className="question-container">
            <div className="question-header">
              <div className="question-meta">
                <span className="question-type">{currentQuestion.type}</span>
                <span className="question-difficulty">{currentQuestion.difficulty}</span>
                <span className="question-points">{currentQuestion.maxPoints} points</span>
              </div>
            </div>
            
            <div className="question-prompt">
              <h3>{currentQuestion.prompt}</h3>
            </div>
            
            {currentQuestion.detailedScenario && (
              <div className="question-scenario">
                <h4>Scenario:</h4>
                <div className="scenario-content">
                  {currentQuestion.detailedScenario}
                </div>
              </div>
            )}
            
            <div className="question-answer">
              {currentQuestion.type === 'mcq' && currentQuestion.options ? (
                <div className="mcq-options">
                  {currentQuestion.options.map(option => (
                    <label key={option.id} className="mcq-option">
                      <input
                        type="radio"
                        name={`question-${currentQuestion.id}`}
                        value={option.id}
                        checked={currentAnswer?.selectedOptionId === option.id}
                        onChange={(e) => handleAnswerChange(
                          currentQuestion.id, 
                          option.text, 
                          e.target.value
                        )}
                      />
                      <span className="option-text">{option.text}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  className="text-answer"
                  placeholder={`Provide a ${currentQuestion.expectedAnswerLength} answer...`}
                  value={currentAnswer?.userAnswer || ''}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  rows={currentQuestion.expectedAnswerLength === 'comprehensive' ? 10 : 
                        currentQuestion.expectedAnswerLength === 'moderate' ? 6 : 3}
                />
              )}
            </div>
            
            <div className="evaluation-criteria">
              <h5>Evaluation Criteria:</h5>
              <ul>
                {currentQuestion.evaluationCriteria.map((criterion, idx) => (
                  <li key={idx}>{criterion}</li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="question-navigation">
            <button 
              onClick={handlePreviousQuestion}
              disabled={currentQuestionIndex === 0}
              className="nav-button prev-button"
            >
              ← Previous
            </button>
            
            <div className="question-dots">
              {test.questions.map((_, idx) => (
                <button
                  key={idx}
                  className={`question-dot ${idx === currentQuestionIndex ? 'active' : ''} ${
                    answers.find(a => a.questionId === test.questions[idx].id) ? 'answered' : ''
                  }`}
                  onClick={() => setCurrentQuestionIndex(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            
            {currentQuestionIndex === test.questions.length - 1 ? (
              <button 
                onClick={handleCompleteTest}
                className="nav-button complete-button"
                disabled={answers.length !== test.questions.length}
              >
                Complete Test
              </button>
            ) : (
              <button 
                onClick={handleNextQuestion}
                className="nav-button next-button"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (testState === 'completed') {
    return (
      <div className="chapter-test-container">
        <div className="test-header">
          <h2>Test Completed!</h2>
        </div>
        <div className="test-completion">
          <div className="completion-message">
            <h3>🎉 Great job!</h3>
            <p>Your test has been submitted and is being evaluated.</p>
            <p>Time taken: {formatTime(timeElapsed)}</p>
          </div>
          <button onClick={onClose} className="close-test-button">
            Return to Chapter
          </button>
        </div>
      </div>
    )
  }

  return null
}

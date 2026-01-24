import { useState } from 'react'
import { SwipeCard } from './SwipeCard'
import type { AssessmentQuestion, AssessmentResponse, AssessmentResult, KnowledgeLevel } from '../types'

interface AssessmentScreenProps {
  questions: AssessmentQuestion[]
  onComplete: (results: AssessmentResult[]) => void
  topic: string
}

export function AssessmentScreen({ questions, onComplete }: AssessmentScreenProps) {
  console.log('AssessmentScreen rendered with', questions.length, 'questions')

  const [currentIndex, setCurrentIndex] = useState(0)
  const [responses, setResponses] = useState<AssessmentResponse[]>([])
  const [isCompleting, setIsCompleting] = useState(false)

  // Safety check for empty questions
  if (!questions || questions.length === 0) {
    return (
      <div className="app-shell">
        <div className="assessment-screen">
          <div className="assessment-header">
            <h2>Loading Assessment...</h2>
            <p>Preparing your knowledge assessment questions...</p>
          </div>
        </div>
      </div>
    )
  }

  const handleSwipe = (questionId: string, knows: boolean) => {
    const question = questions.find(q => q.id === questionId)
    if (!question) return

    const response: AssessmentResponse = {
      questionId,
      skillId: question.skillId,
      knows
    }

    const newResponses = [...responses, response]
    setResponses(newResponses)

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      // Assessment complete
      setIsCompleting(true)
      calculateResults(newResponses)
    }
  }

  const calculateResults = (allResponses: AssessmentResponse[]) => {
    // Group responses by skill
    const skillGroups = new Map<string, AssessmentResponse[]>()
    
    allResponses.forEach(response => {
      if (!skillGroups.has(response.skillId)) {
        skillGroups.set(response.skillId, [])
      }
      skillGroups.get(response.skillId)!.push(response)
    })

    const results: AssessmentResult[] = []

    skillGroups.forEach((skillResponses, skillId) => {
      const question = questions.find(q => q.skillId === skillId)
      if (!question) return

      const totalQuestions = skillResponses.length
      const knownQuestions = skillResponses.filter(r => r.knows).length
      const score = totalQuestions > 0 ? knownQuestions / totalQuestions : 0

      let knowledgeLevel: KnowledgeLevel
      if (score >= 0.67) {
        knowledgeLevel = 'advanced'
      } else if (score >= 0.34) {
        knowledgeLevel = 'intermediate'
      } else {
        knowledgeLevel = 'beginner'
      }

      results.push({
        skillId,
        skillName: question.skillName,
        category: question.category,
        score,
        knowledgeLevel,
        questionsAnswered: totalQuestions,
        questionsKnown: knownQuestions
      })
    })

    setTimeout(() => {
      onComplete(results)
    }, 1000) // Brief delay for UX
  }

  const progress = ((currentIndex + (responses.length > currentIndex ? 1 : 0)) / questions.length) * 100

  if (isCompleting) {
    return (
      <div className="app-shell">
        <div className="assessment-screen completing">
          <div className="assessment-header">
            <h2>Analyzing Your Knowledge...</h2>
            <div className="completion-spinner">
              <div className="spinner"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="assessment-screen">
        <div className="assessment-header">
          <h2>Knowledge Assessment</h2>
          <p>Swipe right if you know it, left if you don't</p>
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="progress-text">
              {Math.min(currentIndex + 1, questions.length)} / {questions.length}
            </span>
          </div>
        </div>

        <div className="card-stack-container">
          <div className="card-stack">
            {questions.map((question, index) => {
              const isActive = index === currentIndex
              const isVisible = index >= currentIndex && index <= currentIndex + 2
              
              if (!isVisible) return null

              return (
                <SwipeCard
                  key={question.id}
                  question={question}
                  onSwipe={handleSwipe}
                  isActive={isActive}
                  zIndex={questions.length - index}
                />
              )
            })}
          </div>
        </div>

        <div className="assessment-instructions">
          <div className="instruction-item">
            <div className="swipe-demo left">←</div>
            <span>Don't Know</span>
          </div>
          <div className="instruction-item">
            <div className="swipe-demo right">→</div>
            <span>Know</span>
          </div>
        </div>
      </div>
    </div>
  )
}

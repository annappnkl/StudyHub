import { useState, useRef, useEffect } from 'react'

interface InterviewPracticeProps {
  onComplete?: () => void
}

type InterviewPhase = 'ready' | 'case-reading' | 'interview'

interface InterviewQuestion {
  id: string
  question: string
  keyPoints: string[]
  followUps: string[]
}

export function InterviewPractice({ onComplete }: InterviewPracticeProps) {
  // Phase management
  const [currentPhase, setCurrentPhase] = useState<InterviewPhase>('ready')
  const [readingTimeLeft, setReadingTimeLeft] = useState(300) // 5 minutes in seconds
  
  // Interview state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [userResponses, setUserResponses] = useState<string[]>([])
  const [currentResponse, setCurrentResponse] = useState('')
  const [feedback, setFeedback] = useState<string[]>([])
  const [interviewComplete, setInterviewComplete] = useState(false)
  const [score, setScore] = useState<number>(0)

  const readingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clean case study content (without Questions 1, 2, 3)
  const CASE_STUDY_CONTENT = `**Client Goal**
Our client is Beautify. Beautify has approached McKinsey for help with exploring new ways to approach its customers.

**Situation Description**
Beautify is a global prestige cosmetics company that sells its products mainly inside high-end department stores such as Harrods and Shanghai No. 1. It also has a presence online with specialty retailers like Sephora. Beautify produces a number of makeup, fragrance, and skin care products sold under several different brands.

In department stores, beauty consultants play a critical role with consumers:
• approaching "passive" customers
• demonstrating their knowledge of the products
• actively selling the products
• maintaining a loyal customer base of repeat buyers

These consultants are hired directly by Beautify or through specialist, third-party agencies that find new recruits for a fee. Beautify is then responsible for selecting, training, and paying the consultants. Within Beautify, beauty consultants are managed independently by each brand in each country. For example, this may mean a consultant might be part of the Chanel team in a store.

However, consumers are shifting more to online shopping, and too many beauty consultants are left working in empty department stores.

**McKinsey Study**
Beautify's president and COO engaged McKinsey to help evaluate if training the majority of beauty consultants to use virtual channels to connect with customers could be profitable for the company.

**Helpful Hints**
• Write down important information.
• Feel free to ask the interviewer to explain anything that is not clear to you.`

  // Interview questions with evaluation criteria
  const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
    {
      id: 'strategy',
      question: 'Beautify is excited to support its current staff of beauty consultants on the journey to becoming virtual social media-beauty advisors. Consultants would still lead the way in terms of direct consumer engagement and would be expected to maintain and grow a group of clients. They would sell products through their own pages on beautify.com, make appearances at major retail outlets, and be active on all social media platforms. What possible factors should Beautify consider when shifting this group of employees toward a new set of responsibilities?',
      keyPoints: ['retailer response', 'competitor analysis', 'current capabilities', 'brand image', 'training needs', 'technology requirements', 'compensation structure', 'change management'],
      followUps: ['Can you elaborate on the retailer partnerships?', 'What specific training would be most critical?', 'How might competitors respond to this strategy?']
    },
    {
      id: 'customer',
      question: 'One of the key areas that Beautify wants to understand is the reaction of current and potential new customers to the virtual social media-beauty advisors. Imagine you are a current Beautify customer and you mostly shop at your local department store because you enjoy the high-touch service offered by in-store consultants. What features would make you consider switching to a mostly virtual sales experience?',
      keyPoints: ['real-time feedback', 'social community', 'personalized recommendations', 'trend insights', 'private consultation', 'mobile app features', 'virtual try-on', 'convenience factors'],
      followUps: ['How important is the personal relationship aspect?', 'What concerns might customers have about virtual consultations?', 'How could technology enhance the experience?']
    },
    {
      id: 'financial',
      question: 'The discussion about virtual advisors has been energizing, but I\'d like to ground this in some analysis. You sit down with your teammates from Beautify finance and come up with the following assumptions: With advisors, you expect a ten percent overall increase in incremental revenue in the first year. In that first year, Beautify will invest €50 million in IT, €25 million in training, €50 million in remodeling department store counters, and €25 million in inventory. Beautify expects a 5% annual depreciation of the upfront investment each year. All-in yearly costs associated with a shift to advisors are expected to be €10 million starting the first year. Beautify\'s revenues are €1.3 billion. How many years would it take until the investment turns profitable?',
      keyPoints: ['incremental revenue calculation', 'upfront investment total', 'annual costs', 'depreciation calculation', 'payback period', 'net present value considerations'],
      followUps: ['Can you walk me through your calculation step by step?', 'What assumptions might be risky in this analysis?', 'How would you test these assumptions?']
    }
  ]

  const startReadingTimer = () => {
    if (readingTimerRef.current) {
      clearInterval(readingTimerRef.current)
    }
    
    setReadingTimeLeft(300) // Reset to 5 minutes

    readingTimerRef.current = setInterval(() => {
      setReadingTimeLeft(prev => {
        if (prev <= 1) {
          if (readingTimerRef.current) {
            clearInterval(readingTimerRef.current)
          }
          // Automatically proceed to interview after 5 minutes
          startInterview()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const startCaseReading = () => {
    setCurrentPhase('case-reading')
    startReadingTimer()
  }

  const proceedToInterview = () => {
    if (readingTimerRef.current) {
      clearInterval(readingTimerRef.current)
    }
    startInterview()
  }

  const startInterview = () => {
    setCurrentPhase('interview')
    setCurrentQuestionIndex(0)
    setUserResponses([])
    setCurrentResponse('')
    setFeedback([])
    setInterviewComplete(false)
    setScore(0)
  }

  const evaluateResponse = (response: string, question: InterviewQuestion): { score: number; feedback: string } => {
    const lowerResponse = response.toLowerCase()
    let score = 0
    let matchedPoints: string[] = []
    
    // Check for key points mentioned
    question.keyPoints.forEach(point => {
      if (lowerResponse.includes(point.toLowerCase()) || 
          lowerResponse.includes(point.split(' ')[0].toLowerCase())) {
        score += 10
        matchedPoints.push(point)
      }
    })

    // Bonus points for structure and length
    if (response.length > 100) score += 5
    if (response.includes('1.') || response.includes('First') || response.includes('•')) score += 5
    
    // Cap score at 100
    score = Math.min(score, 100)

    let feedback = `Good response! You scored ${score}/100. `
    
    if (matchedPoints.length > 0) {
      feedback += `You addressed key areas: ${matchedPoints.join(', ')}. `
    }
    
    const missedPoints = question.keyPoints.filter(point => !matchedPoints.includes(point))
    if (missedPoints.length > 0) {
      feedback += `Consider also discussing: ${missedPoints.slice(0, 3).join(', ')}.`
    }

    return { score, feedback }
  }

  const handleSubmitResponse = () => {
    if (!currentResponse.trim()) return

    const currentQuestion = INTERVIEW_QUESTIONS[currentQuestionIndex]
    const evaluation = evaluateResponse(currentResponse, currentQuestion)
    
    // Store response and feedback
    const newResponses = [...userResponses, currentResponse]
    const newFeedback = [...feedback, evaluation.feedback]
    
    setUserResponses(newResponses)
    setFeedback(newFeedback)
    setScore(prevScore => prevScore + evaluation.score)
    setCurrentResponse('')

    // Move to next question or complete interview
    if (currentQuestionIndex < INTERVIEW_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    } else {
      setInterviewComplete(true)
    }
  }

  const restartInterview = () => {
    setCurrentPhase('ready')
    setReadingTimeLeft(300)
    setCurrentQuestionIndex(0)
    setUserResponses([])
    setCurrentResponse('')
    setFeedback([])
    setInterviewComplete(false)
    setScore(0)
  }

  // Format time display for reading timer
  const formatReadingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (readingTimerRef.current) {
        clearInterval(readingTimerRef.current)
      }
    }
  }, [])

  // Phase 1: Ready to Start
  if (currentPhase === 'ready') {
    return (
      <div className="interview-practice">
        <div className="interview-header">
          <h2>🎯 Case Interview Practice</h2>
          <p className="interview-subtitle">
            Master consulting case interviews with our interactive Beautify case study simulation
          </p>
        </div>

        <div className="interview-overview">
          <h3>What to Expect:</h3>
          <div className="flow-steps">
            <div className="flow-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h4>📚 Case Reading</h4>
                <p>5 minutes to read and understand the Beautify case study</p>
              </div>
            </div>
            <div className="flow-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h4>💼 Strategic Discussion</h4>
                <p>Answer questions about business strategy and market factors</p>
              </div>
            </div>
            <div className="flow-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4>🧮 Financial Analysis</h4>
                <p>Work through quantitative business calculations</p>
              </div>
            </div>
          </div>
        </div>

        <div className="preparation-checklist">
          <h3>Preparation Checklist:</h3>
          <div className="checklist-items">
            <div className="checklist-item">📝 Have pen and paper ready for notes and calculations</div>
            <div className="checklist-item">⏱️ Set aside 20-30 minutes for the full interview</div>
            <div className="checklist-item">🤔 Think like a consultant: be structured and hypothesis-driven</div>
            <div className="checklist-item">💡 Remember the case interview principles: clarify, structure, analyze</div>
          </div>
        </div>

        <div className="interview-controls">
          <button 
            onClick={startCaseReading}
            className="start-interview-button"
          >
            Start Case Interview
          </button>
        </div>

        <div className="interview-note">
          <p>
            <strong>Note:</strong> This simulation follows McKinsey-style case interview format. 
            You'll be evaluated on structure, business insight, and analytical thinking.
          </p>
        </div>
      </div>
    )
  }

  // Phase 2: Case Study Reading
  if (currentPhase === 'case-reading') {
    return (
      <div className="interview-practice">
        <div className="interview-header">
          <h2>📚 Case Study Reading</h2>
          <div className="reading-timer">
            <span className="timer-label">Reading time:</span>
            <span className="timer-value">{formatReadingTime(readingTimeLeft)}</span>
          </div>
        </div>

        <div className="case-study-content">
          <div className="case-study-text">
            {CASE_STUDY_CONTENT.split('\n').map((line, index) => {
              if (line.trim() === '') return <br key={index} />
              if (line.startsWith('**') && line.endsWith('**')) {
                return <h3 key={index} className="section-header">{line.replace(/\*\*/g, '')}</h3>
              }
              if (line.startsWith('•')) {
                return <li key={index} className="bullet-point">{line.substring(1).trim()}</li>
              }
              return <p key={index} className="case-text">{line}</p>
            })}
          </div>
        </div>

        <div className="reading-controls">
          <button 
            onClick={proceedToInterview}
            className="proceed-button"
          >
            Ready for Interview
          </button>
          <button 
            onClick={restartInterview}
            className="restart-button"
          >
            Restart
          </button>
        </div>

        <div className="reading-instructions">
          <p>📝 <strong>Take notes and familiarize yourself with the business situation.</strong></p>
          <p>⏱️ Time remaining: {formatReadingTime(readingTimeLeft)} (or click "Ready" when finished)</p>
          <p>🔔 The interview will begin automatically when time expires.</p>
        </div>
      </div>
    )
  }

  // Phase 3: Interview Simulation
  return (
    <div className="interview-practice">
      <div className="interview-header">
        <h2>💼 Case Interview</h2>
        {!interviewComplete && (
          <div className="question-progress">
            Question {currentQuestionIndex + 1} of {INTERVIEW_QUESTIONS.length}
          </div>
        )}
      </div>

      {!interviewComplete ? (
        <div className="interview-active">
          <div className="current-question">
            <div className="interviewer-avatar">
              <span>👤</span>
              <span className="interviewer-label">Interviewer</span>
            </div>
            <div className="question-content">
              <p>{INTERVIEW_QUESTIONS[currentQuestionIndex].question}</p>
            </div>
          </div>

          <div className="response-section">
            <label htmlFor="response-input">Your Response:</label>
            <textarea
              id="response-input"
              value={currentResponse}
              onChange={(e) => setCurrentResponse(e.target.value)}
              placeholder="Type your response here... Think about structure, key factors, and business implications."
              rows={8}
              className="response-textarea"
            />
            <div className="response-controls">
              <button 
                onClick={handleSubmitResponse}
                disabled={!currentResponse.trim()}
                className="submit-response-button"
              >
                Submit Response
              </button>
              <div className="character-count">
                {currentResponse.length} characters
              </div>
            </div>
          </div>

          {/* Show previous questions and responses */}
          {userResponses.length > 0 && (
            <div className="previous-responses">
              <h4>Previous Questions & Responses:</h4>
              {userResponses.map((response, index) => (
                <div key={index} className="response-history-item">
                  <div className="history-question">
                    <strong>Q{index + 1}:</strong> {INTERVIEW_QUESTIONS[index].question}
                  </div>
                  <div className="history-response">
                    <strong>Your Response:</strong> {response}
                  </div>
                  <div className="history-feedback">
                    <strong>Feedback:</strong> {feedback[index]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="interview-complete">
          <div className="completion-header">
            <h3>🎉 Interview Complete!</h3>
            <div className="final-score">
              Total Score: {score}/{INTERVIEW_QUESTIONS.length * 100}
            </div>
          </div>

          <div className="interview-summary">
            <h4>Interview Summary:</h4>
            {INTERVIEW_QUESTIONS.map((question, index) => (
              <div key={index} className="summary-item">
                <div className="summary-question">
                  <strong>Q{index + 1}:</strong> {question.id.charAt(0).toUpperCase() + question.id.slice(1)} Question
                </div>
                <div className="summary-response">
                  <strong>Your Response:</strong> {userResponses[index]}
                </div>
                <div className="summary-feedback">
                  <strong>Feedback:</strong> {feedback[index]}
                </div>
              </div>
            ))}
          </div>

          <div className="completion-actions">
            <button onClick={restartInterview} className="restart-button">
              Try Another Interview
            </button>
            <button onClick={onComplete} className="complete-button">
              Return to Chapter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
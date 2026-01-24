import { useState, useRef, useEffect } from 'react'

// TypeScript declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
  readonly resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start(): void
  stop(): void
}

interface SpeechRecognitionResult {
  readonly length: number
  readonly isFinal: boolean
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor
    webkitSpeechRecognition: SpeechRecognitionConstructor
  }
}

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
  const [feedback, setFeedback] = useState<string[]>([])
  const [interviewComplete, setInterviewComplete] = useState(false)
  const [score, setScore] = useState<number>(0)
  
  // Voice functionality state
  const [isRecording, setIsRecording] = useState(false)
  const [isAISpeaking, setIsAISpeaking] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<Array<{role: 'ai' | 'user', text: string, timestamp: Date}>>([])
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)

  const readingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)

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

  const startInterview = async () => {
    setCurrentPhase('interview')
    setCurrentQuestionIndex(0)
    setUserResponses([])
    setFeedback([])
    setInterviewComplete(false)
    setScore(0)
    setConversationHistory([])

    try {
      // Request microphone permissions upfront
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true })
      }
    } catch (error) {
      console.warn('Microphone access denied:', error)
      // Continue anyway as speech recognition might still work
    }

    // AI introduces the interview - display first, then speak
    const introText = "Hello! I'm your AI interviewer. I'll be conducting a case interview with you today using the Beautify case study. Let's begin with our first question."
    const introMessage = { role: 'ai' as const, text: introText, timestamp: new Date() }
    setConversationHistory([introMessage])
    
    // Wait for UI to update, then speak intro
    setTimeout(async () => {
      try {
        await speakText(introText)
        
        // After intro finishes speaking, show and ask the first question
        setTimeout(async () => {
          const firstQuestion = INTERVIEW_QUESTIONS[0]
          const questionMessage = { role: 'ai' as const, text: firstQuestion.question, timestamp: new Date() }
          setConversationHistory(prev => [...prev, questionMessage])
          
          // Wait for UI update, then speak the question
          setTimeout(async () => {
            try {
              await speakText(firstQuestion.question)
            } catch (error) {
              console.warn('Auto-play blocked for question:', error)
            }
          }, 500)
        }, 1000)
      } catch (error) {
        console.warn('Auto-play blocked for intro, showing first question anyway:', error)
        // If speech fails, still show the first question
        setTimeout(() => {
          const firstQuestion = INTERVIEW_QUESTIONS[0]
          const questionMessage = { role: 'ai' as const, text: firstQuestion.question, timestamp: new Date() }
          setConversationHistory(prev => [...prev, questionMessage])
        }, 2000)
      }
    }, 1000)
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


  const handleVoiceResponse = async () => {
    if (isRecording) {
      // Stop current recording
      stopVoiceRecording()
    } else {
      // Start new recording
      try {
        const transcript = await startVoiceRecording()
        
        if (transcript.trim()) {
          // Add voice response to conversation
          const userMessage = { role: 'user' as const, text: transcript, timestamp: new Date() }
          setConversationHistory(prev => [...prev, userMessage])
          
          // Process the voice response directly
          await processResponse(transcript)
        }
      } catch (error) {
        console.error('Voice recording failed:', error)
        alert('Voice recording failed. Please ensure microphone permissions are enabled.')
      }
    }
  }

  const stopVoiceRecording = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop()
      speechRecognitionRef.current = null
    }
    setIsRecording(false)
  }

  const processResponse = async (responseText: string) => {
    if (!responseText.trim()) return

    const currentQuestion = INTERVIEW_QUESTIONS[currentQuestionIndex]
    const evaluation = evaluateResponse(responseText, currentQuestion)
    
    // Store response and feedback
    const newResponses = [...userResponses, responseText]
    const newFeedback = [...feedback, evaluation.feedback]
    
    setUserResponses(newResponses)
    setFeedback(newFeedback)
    setScore(prevScore => prevScore + evaluation.score)

    // AI provides feedback - display first, then speak
    const aiResponse = `Thank you for your response. ${evaluation.feedback}`
    const aiMessage = { role: 'ai' as const, text: aiResponse, timestamp: new Date() }
    setConversationHistory(prev => [...prev, aiMessage])

    // Wait a moment for UI to update, then speak the feedback
    setTimeout(async () => {
      await speakText(aiResponse)
      
      // After speaking feedback, move to next question or complete interview
      if (currentQuestionIndex < INTERVIEW_QUESTIONS.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1)
        
        // Ask the next question - display first, then speak
        setTimeout(async () => {
          const nextQuestion = INTERVIEW_QUESTIONS[currentQuestionIndex + 1]
          const questionText = `Now, let's move to the next question. ${nextQuestion.question}`
          const questionMessage = { role: 'ai' as const, text: questionText, timestamp: new Date() }
          setConversationHistory(prev => [...prev, questionMessage])
          
          // Wait for UI update, then speak
          setTimeout(async () => {
            await speakText(questionText)
          }, 500)
        }, 1000)
      } else {
        // Interview complete - display final message first, then speak
        setTimeout(async () => {
          const finalMessage = "That concludes our interview. Thank you for your responses. You can review your performance and try again if you'd like."
          const finalAiMessage = { role: 'ai' as const, text: finalMessage, timestamp: new Date() }
          setConversationHistory(prev => [...prev, finalAiMessage])
          
          setTimeout(async () => {
            await speakText(finalMessage)
            setInterviewComplete(true)
          }, 500)
        }, 1000)
      }
    }, 500)
  }

  const restartInterview = () => {
    setCurrentPhase('ready')
    setReadingTimeLeft(300)
    setCurrentQuestionIndex(0)
    setUserResponses([])
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

  // Text-to-Speech using ElevenLabs
  const speakText = async (text: string): Promise<void> => {
    try {
      setIsAISpeaking(true)
      
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause()
        setCurrentAudio(null)
      }

      const API_BASE = import.meta.env.PROD 
        ? '' 
        : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787')

      const response = await fetch(`${API_BASE}/api/text-to-speech`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ text })
      })

      if (!response.ok) {
        throw new Error('Failed to generate speech')
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      
      setCurrentAudio(audio)

      audio.onended = () => {
        setIsAISpeaking(false)
        URL.revokeObjectURL(audioUrl)
        setCurrentAudio(null)
      }

      audio.onerror = () => {
        setIsAISpeaking(false)
        console.error('Audio playback failed')
      }

      await audio.play()
    } catch (error) {
      console.error('Text-to-speech error:', error)
      setIsAISpeaking(false)
    }
  }

  // Voice Recognition with auto-stop
  const startVoiceRecording = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      
      if (!SpeechRecognition) {
        reject(new Error('Speech recognition not supported in this browser'))
        return
      }

      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      speechRecognitionRef.current = recognition
      setIsRecording(true)

      let finalTranscript = ''
      let silenceTimeout: ReturnType<typeof setTimeout>
      
      // Auto-stop after 10 seconds of no speech
      const resetSilenceTimeout = () => {
        if (silenceTimeout) clearTimeout(silenceTimeout)
        silenceTimeout = setTimeout(() => {
          recognition.stop()
        }, 10000)
      }

      recognition.onstart = () => {
        resetSilenceTimeout()
      }

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }
        
        // Reset silence timeout on any speech
        if (interimTranscript || finalTranscript) {
          resetSilenceTimeout()
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error)
        if (silenceTimeout) clearTimeout(silenceTimeout)
        setIsRecording(false)
        speechRecognitionRef.current = null
        reject(new Error(`Speech recognition failed: ${event.error}`))
      }

      recognition.onend = () => {
        if (silenceTimeout) clearTimeout(silenceTimeout)
        setIsRecording(false)
        speechRecognitionRef.current = null
        resolve(finalTranscript.trim())
      }

      recognition.start()
    })
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
                <h4>🎤 Voice Interview</h4>
                <p>Conversational interview with AI - speak your answers and receive voice feedback</p>
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
            <div className="checklist-item">🎤 Enable microphone permissions for voice interaction</div>
            <div className="checklist-item">🔊 Ensure speakers/headphones are working for AI voice</div>
            <div className="checklist-item">📝 Have pen and paper ready for notes and calculations</div>
            <div className="checklist-item">⏱️ Set aside 20-30 minutes for the full interview</div>
            <div className="checklist-item">🤔 Think like a consultant: be structured and hypothesis-driven</div>
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
          {/* AI Interviewer Status */}
          <div className="ai-interviewer-status">
            <div className={`ai-avatar ${isAISpeaking ? 'speaking' : ''}`}>
              <span className="ai-face">🤖</span>
            </div>
            {isAISpeaking && (
              <div className="ai-status">
                🔊 AI is speaking...
              </div>
            )}
          </div>

          {/* Conversation History */}
          <div className="conversation-history">
            <h4>Interview Conversation:</h4>
            <div className="conversation-content">
              {conversationHistory.length === 0 && (
                <p className="no-conversation">Conversation will appear here once the interview begins...</p>
              )}
              {conversationHistory.map((entry, index) => (
                <div key={index} className={`conversation-entry ${entry.role}`}>
                  <div className="conversation-role">
                    <strong>{entry.role === 'ai' ? '🤖 AI Interviewer' : '👤 You'}:</strong>
                    <span className="timestamp">
                      {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="conversation-text">{entry.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Voice Controls - Now below conversation */}
          <div className="voice-controls">
            {!isAISpeaking && (
              <button 
                onClick={handleVoiceResponse}
                className={`voice-record-button ${isRecording ? 'recording' : ''}`}
              >
                {isRecording ? '⏹️ Stop Recording' : '🎤 Start Recording Answer'}
              </button>
            )}

            {isAISpeaking && (
              <div className="ai-speaking-indicator">
                <div className="pulse-animation">🔊</div>
                <span>AI is speaking...</span>
              </div>
            )}
          </div>

          {/* Instructions with bottom spacing */}
          <div className="voice-instructions">
            <h5>💡 Voice Interview Tips:</h5>
            <ul>
              <li>Wait for the AI to finish speaking before responding</li>
              <li>Speak clearly and at a normal pace</li>
              <li>Structure your answers: situation, task, action, result</li>
              <li>Be specific with examples and quantify when possible</li>
            </ul>
          </div>
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
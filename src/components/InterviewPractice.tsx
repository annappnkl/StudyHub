import { useState, useRef, useEffect } from 'react'

interface InterviewPracticeProps {
  onComplete?: () => void
}

type InterviewPhase = 'ready' | 'case-study' | 'voice-interview'

export function InterviewPractice({ onComplete }: InterviewPracticeProps) {
  // Phase management
  const [currentPhase, setCurrentPhase] = useState<InterviewPhase>('ready')
  const [readingTimeLeft, setReadingTimeLeft] = useState(300) // 5 minutes in seconds
  
  // Voice interview state
  const [status, setStatus] = useState<string>('Ready to start your case interview practice')
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([])
  const [isRecording, setIsRecording] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [isAISpeaking, setIsAISpeaking] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const readingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // API base URL - will be Python FastAPI service
  const API_BASE = 'http://localhost:8001'

  // Detailed Beautify case study content
  const BEAUTIFY_CASE_STUDY = `Beautify

Client goal
Our client is Beautify. Beautify has approached McKinsey for help with exploring new ways to approach its customers.

Situation description
Beautify is a global prestige cosmetics company that sells its products mainly inside high-end department stores such as Harrods and Shanghai No. 1. It also has a presence online with specialty retailers like Sephora. Beautify produces a number of makeup, fragrance, and skin care products sold under several different brands.

In department stores, beauty consultants play a critical role with consumers:
• approaching "passive" customers
• demonstrating their knowledge of the products
• actively selling the products
• maintaining a loyal customer base of repeat buyers

These consultants are hired directly by Beautify or through specialist, third-party agencies that find new recruits for a fee. Beautify is then responsible for selecting, training, and paying the consultants. Within Beautify, beauty consultants are managed independently by each brand in each country. For example, this may mean a consultant might be part of the Chanel team in a store.

However, consumers are shifting more to online shopping, and too many beauty consultants are left working in empty department stores.

McKinsey study
Beautify's president and COO engaged McKinsey to help evaluate if training the majority of beauty consultants to use virtual channels to connect with customers could be profitable for the company.

Helpful hints
• Write down important information.
• Feel free to ask the interviewer to explain anything that is not clear to you.

Question 1:
Beautify is excited to support its current staff of beauty consultants on the journey to becoming virtual social media-beauty advisors. Consultants would still lead the way in terms of direct consumer engagement and would be expected to maintain and grow a group of clients. They would sell products through their own pages on beautify.com, make appearances at major retail outlets, and be active on all social media platforms.

What possible factors should Beautify consider when shifting this group of employees toward a new set of responsibilities?

Question 2:
One of the key areas that Beautify wants to understand is the reaction of current and potential new customers to the virtual social media-beauty advisors.

Imagine you are a current Beautify customer and you mostly shop at your local department store because you enjoy the high-touch service offered by in-store consultants. What features would make you consider switching to a mostly virtual sales experience?

Question 3:
The discussion about virtual advisors has been energizing, but you'd like to ground the discussion in some analysis. You've always found it helpful to frame an investment in terms of how long it will take to turn profitable, such as when incremental revenues are greater than the cost of the project.

You sit down with your teammates from Beautify finance and come up with the following assumptions:

• With advisors, you expect ten percent overall increase in incremental revenue—the team assumes that Beautify will gain new customers who enjoy the experience as well as increased online sales through those engaged, but it will also lose some to other brands that still provide more in-store service. The team assumes this will happen in the first year.
• In that first year, Beautify will invest €50 million in IT, €25 million in training, €50 million in remodeling department store counters, and €25 million in inventory.
• Beautify expects a 5% annual depreciation (loss in value) of the upfront investment (e.g. infrastructure depreciates in value) each year
• All-in yearly costs associated with a shift to advisors are expected to be €10 million and will start during the first year.
• Beautify's revenues are €1.3 billion.

How many years would it take until the investment turns profitable?

Helpful hints
• Don't feel rushed into performing calculations. Take your time.
• Remember that calculators are not allowed - you may want to write out your calculations on paper during the interview.
• Talk your interviewer through your steps so that you can demonstrate an organized approach; the more you talk, the easier it will be for your interviewer to help you.`

  const appendTranscript = (role: string, text: string) => {
    setTranscript(prev => [...prev, { role, text }])
  }

  const playAudioFromBase64 = (base64: string): HTMLAudioElement => {
    const bytes = new Uint8Array(
      atob(base64)
        .split('')
        .map(char => char.charCodeAt(0))
    )
    const blob = new Blob([bytes], { type: 'audio/mpeg' })
    const audio = new Audio(URL.createObjectURL(blob))
    return audio
  }

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
          // Automatically proceed to voice interview after 5 minutes
          startVoiceInterview()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const startCountdown = (seconds: number, onFinish: () => void) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }
    
    setTimeRemaining(seconds)

    countdownIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current)
          }
          setTimeRemaining(null)
          onFinish()
          return null
        }
        return prev - 1
      })
    }, 1000)
  }

  const playQuestion = async () => {
    if (!sessionId) return

    try {
      setStatus('AI is asking a question...')
      setIsAISpeaking(true)

      const response = await fetch(`${API_BASE}/question?session_id=${sessionId}`)
      const data = await response.json()

      if (data.error) {
        setStatus(`Error: ${data.error}`)
        return
      }

      appendTranscript('ai', data.ai_transcript)

      // Play audio
      const audio = playAudioFromBase64(data.audio)
      
      audio.onended = () => {
        setIsAISpeaking(false)

        if (data.wait_time) {
          // Preparation phase (case reading or math)
          setStatus('Preparation time - read the case carefully...')
          
          startCountdown(data.wait_time, async () => {
            // Automatically trigger next question after preparation
            await playQuestion()
          })
        } else {
          setStatus('Your turn - click "Start Recording" to answer')
        }
      }

      audio.onerror = () => {
        setIsAISpeaking(false)
        setStatus('Audio playback failed - but you can still read the question above')
      }

      await audio.play()
    } catch (error) {
      console.error('Error playing question:', error)
      setStatus('Connection error. Make sure the interview service is running.')
      setIsAISpeaking(false)
    }
  }

  const startInterview = () => {
    setCurrentPhase('case-study')
    startReadingTimer()
  }

  const proceedToVoiceInterview = () => {
    if (readingTimerRef.current) {
      clearInterval(readingTimerRef.current)
    }
    startVoiceInterview()
  }

  const startVoiceInterview = async () => {
    const newSessionId = Math.random().toString(36).substring(2, 10)
    setSessionId(newSessionId)
    setCurrentPhase('voice-interview')
    setTranscript([])
    setStatus('Starting voice interview...')
    await playQuestion()
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        setStatus('Processing your answer...')
        setIsRecording(false)

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('file', blob, 'answer.webm')

        try {
          const response = await fetch(`${API_BASE}/answer?session_id=${sessionId}`, {
            method: 'POST',
            body: formData
          })
          
          const data = await response.json()

          if (data.user_transcript) {
            appendTranscript('user', data.user_transcript)
          }

          if (data.ai_transcript && data.audio) {
            // AI follow-up response
            setStatus('AI is responding...')
            setIsAISpeaking(true)
            
            appendTranscript('ai', data.ai_transcript)
            
            const audio = playAudioFromBase64(data.audio)
            audio.onended = () => {
              setIsAISpeaking(false)
              if (data.wait_time) {
                // Math problem or preparation phase
                startCountdown(data.wait_time, async () => {
                  await playQuestion()
                })
              } else {
                setStatus('Your turn - click "Start Recording" to continue')
              }
            }
            await audio.play()
          } else if (data.message === 'Interview has concluded.') {
            setStatus('Interview completed! Great job.')
            onComplete?.()
          }

        } catch (error) {
          console.error('Error submitting answer:', error)
          setStatus('Error submitting answer. Please try again.')
        }

        // Stop media tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setStatus('Recording... (15 seconds max)')

      // Auto-stop after 15 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }, 15000)

    } catch (error) {
      console.error('Error starting recording:', error)
      setStatus('Microphone access denied. Please allow microphone permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  const endInterview = () => {
    // Clear all timers
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }
    if (readingTimerRef.current) {
      clearInterval(readingTimerRef.current)
    }
    
    setStatus('Interview ended.')
    setTimeRemaining(null)
    setCurrentPhase('ready')
    setReadingTimeLeft(300)
    setIsRecording(false)
    setSessionId(null)
    setTranscript([])
    onComplete?.()
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
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
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
            Practice your consulting case interview skills with AI-powered feedback
          </p>
        </div>

        <div className="interview-instructions">
          <h4>What to expect:</h4>
          <ul>
            <li>📚 <strong>Step 1:</strong> Read the Beautify case study (5 minutes)</li>
            <li>🎤 <strong>Step 2:</strong> Voice interview with AI interviewer</li>
            <li>💬 <strong>Step 3:</strong> Answer questions and get real-time feedback</li>
            <li>🧮 <strong>Step 4:</strong> Solve quantitative problems</li>
          </ul>
        </div>

        <div className="setup-checklist">
          <h4>Before you start:</h4>
          <ul>
            <li>🎧 Ensure your microphone and speakers are working</li>
            <li>📝 Have pen and paper ready for calculations</li>
            <li>🔇 Find a quiet environment</li>
            <li>⏱️ Allow 20-30 minutes for the full interview</li>
          </ul>
        </div>

        <div className="interview-controls">
          <button 
            onClick={startInterview}
            className="start-interview-button"
          >
            Start Case Interview
          </button>
        </div>

        <div className="interview-note">
          <p>
            <strong>Note:</strong> This practice session uses the Beautify cosmetics case study. 
            You'll work with an AI interviewer through the complete consulting interview process.
          </p>
        </div>
      </div>
    )
  }

  // Phase 2: Case Study Reading
  if (currentPhase === 'case-study') {
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
            {BEAUTIFY_CASE_STUDY.split('\n').map((line, index) => {
              if (line.trim() === '') return <br key={index} />
              if (line.startsWith('•')) {
                return <li key={index} className="bullet-point">{line.substring(1).trim()}</li>
              }
              if (line.trim() === 'Beautify' || line.startsWith('Question') || line.startsWith('Client goal') || line.startsWith('Situation description') || line.startsWith('McKinsey study') || line.startsWith('Helpful hints')) {
                return <h3 key={index} className="section-header">{line}</h3>
              }
              return <p key={index} className="case-text">{line}</p>
            })}
          </div>
        </div>

        <div className="reading-controls">
          <button 
            onClick={proceedToVoiceInterview}
            className="proceed-button"
          >
            Ready - Start Voice Interview
          </button>
          <button 
            onClick={endInterview}
            className="end-interview-button"
          >
            End Session
          </button>
        </div>

        <div className="reading-instructions">
          <p>📝 <strong>Take your time to read and understand the case.</strong></p>
          <p>⏱️ You have {formatReadingTime(readingTimeLeft)} remaining, or click "Ready" when you're done.</p>
          <p>🔔 The voice interview will begin automatically when time expires.</p>
        </div>
      </div>
    )
  }

  // Phase 3: Voice Interview
  return (
    <div className="interview-practice">
      <div className="interview-header">
        <h2>🎤 Voice Interview</h2>
        <div className="interview-status">
          <p className="status-text">{status}</p>
          {timeRemaining !== null && (
            <p className="timer">Time remaining: {timeRemaining}s</p>
          )}
        </div>
      </div>

      <div className="ai-interviewer-container">
        <div className={`ai-avatar ${isAISpeaking ? 'speaking' : ''}`}>
          <div className="avatar-circle">
            <span>AI</span>
          </div>
        </div>
      </div>

      <div className="interview-transcript">
        <h4>Interview Transcript</h4>
        <div className="transcript-content">
          {transcript.length === 0 && (
            <p className="no-transcript">Conversation will appear here...</p>
          )}
          {transcript.map((entry, index) => (
            <div key={index} className={`transcript-entry ${entry.role}`}>
              <strong>{entry.role === 'ai' ? 'AI Interviewer' : 'You'}:</strong>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="interview-controls">
        {!isRecording && !isAISpeaking && timeRemaining === null && (
          <button 
            onClick={startRecording}
            className="record-button"
          >
            🎤 Start Recording Answer
          </button>
        )}
        
        {isRecording && (
          <button 
            onClick={stopRecording}
            className="stop-recording-button"
          >
            ⏹️ Stop Recording
          </button>
        )}
        
        <button 
          onClick={endInterview}
          className="end-interview-button"
        >
          End Interview
        </button>
      </div>
    </div>
  )
}

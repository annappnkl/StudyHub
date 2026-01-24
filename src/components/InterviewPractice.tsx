import { useState, useRef, useEffect } from 'react'

interface InterviewPracticeProps {
  onComplete?: () => void
}

export function InterviewPractice({ onComplete }: InterviewPracticeProps) {
  const [status, setStatus] = useState<string>('Ready to start your case interview practice')
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([])
  const [isRecording, setIsRecording] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [isInterviewStarted, setIsInterviewStarted] = useState(false)
  const [isAISpeaking, setIsAISpeaking] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // API base URL - will be Python FastAPI service
  const API_BASE = 'http://localhost:8001'

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

  const startInterview = async () => {
    const newSessionId = Math.random().toString(36).substring(2, 10)
    setSessionId(newSessionId)
    setIsInterviewStarted(true)
    setTranscript([])
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
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }
    setStatus('Interview ended.')
    setTimeRemaining(null)
    setIsInterviewStarted(false)
    setIsRecording(false)
    setSessionId(null)
    onComplete?.()
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
    }
  }, [])

  return (
    <div className="interview-practice">
      <div className="interview-header">
        <h2>🎯 Case Interview Practice</h2>
        <p className="interview-subtitle">
          Practice your consulting case interview skills with AI-powered feedback
        </p>
      </div>

      <div className="ai-interviewer-container">
        <div className={`ai-avatar ${isAISpeaking ? 'speaking' : ''}`}>
          <div className="avatar-circle">
            <span>AI</span>
          </div>
        </div>
        
        <div className="interview-status">
          <p className="status-text">{status}</p>
          {timeRemaining !== null && (
            <p className="timer">Time remaining: {timeRemaining}s</p>
          )}
        </div>
      </div>

      <div className="interview-transcript">
        <h4>Interview Transcript</h4>
        <div className="transcript-content">
          {transcript.length === 0 && (
            <p className="no-transcript">Transcript will appear here once the interview starts...</p>
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
        {!isInterviewStarted && (
          <button 
            onClick={startInterview}
            className="start-interview-button"
          >
            Start Case Interview
          </button>
        )}
        
        {isInterviewStarted && !isRecording && !isAISpeaking && timeRemaining === null && (
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
        
        {isInterviewStarted && (
          <button 
            onClick={endInterview}
            className="end-interview-button"
          >
            End Interview
          </button>
        )}
      </div>

      <div className="interview-instructions">
        <h4>Instructions:</h4>
        <ul>
          <li>🎧 Make sure your microphone and speakers are working</li>
          <li>📝 Have pen and paper ready for calculations</li>
          <li>🗣️ Speak clearly when answering questions</li>
          <li>⏱️ Take your time during preparation phases</li>
          <li>💡 Think out loud to demonstrate your problem-solving approach</li>
        </ul>
      </div>

      <div className="interview-note">
        <p>
          <strong>Note:</strong> This practice session uses the Beautify cosmetics case study. 
          The AI interviewer will guide you through qualitative questions followed by a quantitative analysis.
        </p>
      </div>
    </div>
  )
}

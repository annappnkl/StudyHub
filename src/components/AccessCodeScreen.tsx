import { useState } from 'react'
import './AccessCodeScreen.css'
import { HawkLogo } from './HawkLogo'

interface AccessCodeScreenProps {
  onCodeVerified: () => void
}

export function AccessCodeScreen({ onCodeVerified }: AccessCodeScreenProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const API_BASE = import.meta.env.PROD 
        ? '' // Use relative paths in production (same domain on Vercel)
        : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787')
      const res = await fetch(`${API_BASE}/api/verify-access-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      })

      const data = await res.json()

      if (data.valid) {
        onCodeVerified()
      } else {
        setError('Invalid access code. Please try again.')
      }
    } catch (err) {
      setError('Failed to verify code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="access-code-screen">
      <div className="access-code-panel">
        <div className="access-code-header">
          <HawkLogo className="logo-mark" size={32} />
          <h1 className="access-code-title">HAWK</h1>
        </div>
        <p className="access-code-subtitle">
          Enter your access code to continue
        </p>
        <form className="access-code-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter access code"
            className="access-code-input"
            autoFocus
            required
            disabled={loading}
          />
          {error && <p className="access-code-error">{error}</p>}
          <button
            type="submit"
            className="access-code-button"
            disabled={loading || !code.trim()}
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}


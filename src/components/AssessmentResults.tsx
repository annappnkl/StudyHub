import type { AssessmentResult } from '../types'

interface AssessmentResultsProps {
  results: AssessmentResult[]
  topic: string
  onContinue: () => void
}

export function AssessmentResults({ results, topic, onContinue }: AssessmentResultsProps) {
  const getKnowledgeLevelColor = (level: string) => {
    switch (level) {
      case 'advanced': return '#22c55e'
      case 'intermediate': return '#f59e0b'
      case 'beginner': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getKnowledgeLevelIcon = (level: string) => {
    switch (level) {
      case 'advanced': return '🎯'
      case 'intermediate': return '📈'
      case 'beginner': return '🌱'
      default: return '❓'
    }
  }

  const overallStats = {
    totalSkills: results.length,
    advanced: results.filter(r => r.knowledgeLevel === 'advanced').length,
    intermediate: results.filter(r => r.knowledgeLevel === 'intermediate').length,
    beginner: results.filter(r => r.knowledgeLevel === 'beginner').length
  }

  const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length

  return (
    <div className="app-shell">
      <div className="assessment-results">
        <div className="results-header">
          <h2>Your Knowledge Assessment</h2>
          <p>Here's what we learned about your background in <strong>{topic}</strong></p>
        </div>

      <div className="overall-stats">
        <div className="stat-card">
          <div className="stat-number">{Math.round(averageScore * 100)}%</div>
          <div className="stat-label">Overall Knowledge</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{overallStats.totalSkills}</div>
          <div className="stat-label">Skills Assessed</div>
        </div>
      </div>

      <div className="knowledge-breakdown">
        <h3>Knowledge Levels by Skill</h3>
        <div className="skills-grid">
          {results.map((result) => (
            <div key={result.skillId} className="skill-result-card">
              <div className="skill-header">
                <div className="skill-info">
                  <span className="skill-icon">
                    {getKnowledgeLevelIcon(result.knowledgeLevel)}
                  </span>
                  <div>
                    <div className="skill-name">{result.skillName}</div>
                    <div className="skill-category">{result.category}</div>
                  </div>
                </div>
                <div 
                  className="knowledge-level-badge"
                  style={{ backgroundColor: getKnowledgeLevelColor(result.knowledgeLevel) }}
                >
                  {result.knowledgeLevel}
                </div>
              </div>
              
              <div className="skill-stats">
                <div className="score-bar">
                  <div 
                    className="score-fill"
                    style={{ 
                      width: `${result.score * 100}%`,
                      backgroundColor: getKnowledgeLevelColor(result.knowledgeLevel)
                    }}
                  />
                </div>
                <div className="score-text">
                  {result.questionsKnown} / {result.questionsAnswered} questions known
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="level-legend">
        <h4>Knowledge Levels</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-icon">🌱</span>
            <span className="legend-text"><strong>Beginner:</strong> 0-33% - We'll focus on building foundations</span>
          </div>
          <div className="legend-item">
            <span className="legend-icon">📈</span>
            <span className="legend-text"><strong>Intermediate:</strong> 34-66% - We'll strengthen your understanding</span>
          </div>
          <div className="legend-item">
            <span className="legend-icon">🎯</span>
            <span className="legend-text"><strong>Advanced:</strong> 67-100% - We'll focus on advanced applications</span>
          </div>
        </div>
      </div>

      <div className="personalization-note">
        <div className="note-content">
          <h4>📚 Personalized Learning Plan</h4>
          <p>
            Based on your assessment, we'll customize your learning materials to focus more on areas where 
            you need support while building on your existing strengths. Let's get started!
          </p>
        </div>
      </div>

      <div className="results-actions">
        <button 
          type="button" 
          className="continue-button"
          onClick={onContinue}
        >
          Create My Personalized Study Plan
        </button>
      </div>
      </div>
    </div>
  )
}

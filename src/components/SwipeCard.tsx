import { useState, useRef, useCallback } from 'react'
import type { AssessmentQuestion } from '../types'

interface SwipeCardProps {
  question: AssessmentQuestion
  onSwipe: (questionId: string, knows: boolean) => void
  isActive: boolean
  zIndex: number
}

export function SwipeCard({ question, onSwipe, isActive, zIndex }: SwipeCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!isActive) return
    setIsDragging(true)
    setStartPos({ x: clientX, y: clientY })
    setDragOffset({ x: 0, y: 0 })
  }, [isActive])

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || !isActive) return
    
    const deltaX = clientX - startPos.x
    const deltaY = clientY - startPos.y
    
    setDragOffset({ x: deltaX, y: deltaY })
  }, [isDragging, isActive, startPos])

  const handleEnd = useCallback(() => {
    if (!isDragging || !isActive) return
    
    const threshold = 100
    const { x } = dragOffset
    
    if (Math.abs(x) > threshold) {
      // Swipe detected
      const knows = x > 0 // Right swipe = knows, left swipe = doesn't know
      onSwipe(question.id, knows)
    }
    
    // Reset state
    setIsDragging(false)
    setDragOffset({ x: 0, y: 0 })
  }, [isDragging, isActive, dragOffset, onSwipe, question.id])

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    handleStart(e.clientX, e.clientY)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY)
  }

  const handleMouseUp = () => {
    handleEnd()
  }

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    handleStart(touch.clientX, touch.clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    handleMove(touch.clientX, touch.clientY)
  }

  const handleTouchEnd = () => {
    handleEnd()
  }

  // Button handlers for desktop fallback
  const handleKnowClick = () => {
    if (isActive) {
      onSwipe(question.id, true)
    }
  }

  const handleDontKnowClick = () => {
    if (isActive) {
      onSwipe(question.id, false)
    }
  }

  const rotation = dragOffset.x * 0.1
  const opacity = Math.max(0.5, 1 - Math.abs(dragOffset.x) / 200)
  
  const swipeDirection = Math.abs(dragOffset.x) > 50 ? (dragOffset.x > 0 ? 'right' : 'left') : null

  return (
    <div
      ref={cardRef}
      className={`swipe-card ${isActive ? 'active' : ''} ${swipeDirection ? `swipe-${swipeDirection}` : ''}`}
      style={{
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rotation}deg)`,
        opacity: isActive ? opacity : 0.8,
        zIndex,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={isDragging ? handleMouseMove : undefined}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="swipe-card-content">
        <div className="skill-category">{question.category}</div>
        <div className="question-text">{question.question}</div>
        <div className="skill-name">{question.skillName}</div>
        
        {/* Swipe indicators */}
        <div className="swipe-indicators">
          <div className={`swipe-indicator left ${swipeDirection === 'left' ? 'active' : ''}`}>
            <span>Don't Know</span>
          </div>
          <div className={`swipe-indicator right ${swipeDirection === 'right' ? 'active' : ''}`}>
            <span>Know</span>
          </div>
        </div>
        
        {/* Desktop fallback buttons */}
        <div className="swipe-buttons">
          <button
            type="button"
            className="swipe-button dont-know"
            onClick={handleDontKnowClick}
            disabled={!isActive}
          >
            Don't Know
          </button>
          <button
            type="button"
            className="swipe-button know"
            onClick={handleKnowClick}
            disabled={!isActive}
          >
            Know
          </button>
        </div>
      </div>
    </div>
  )
}

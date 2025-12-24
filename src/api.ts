import type {
  LearningSectionsRequest,
  LearningSectionsResponse,
  LearningSectionsEnhancementRequest,
  LearningSectionsEnhancementResponse,
  PracticeExerciseRefinementRequest,
  PracticeExerciseRefinementResponse,
  PracticeExerciseEvaluationRequest,
  PracticeExerciseEvaluationResponse,
  Exercise,
  ExerciseEvaluationRequest,
  ExerciseEvaluationResponse,
  ExerciseGenerationRequest,
  LectureGenerationRequest,
  StudyPlanGenerationResponse,
  LearningSectionsEnhancedRequest,
  LearningSectionsEnhancedResponse,
  GenerateSectionExerciseRequest,
  GenerateSectionExerciseResponse,
  GenerateGapMaterialRequest,
  GenerateGapMaterialResponse,
  ExplainSelectionRequest,
  ExplainSelectionResponse,
  ExerciseFollowUpRequest,
  ExerciseFollowUpResponse,
} from './types'

const API_BASE = import.meta.env.PROD 
  ? '' // Use relative paths in production (same domain on Vercel)
  : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787')

export async function requestStudyPlan(
  payload: LectureGenerationRequest,
): Promise<StudyPlanGenerationResponse> {
  const res = await fetch(`${API_BASE}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to generate plan: ${res.status} ${message}`)
  }

  return (await res.json()) as StudyPlanGenerationResponse
}

export async function requestExercises(
  payload: ExerciseGenerationRequest,
): Promise<Exercise[]> {
  const res = await fetch(`${API_BASE}/api/exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to generate exercises: ${res.status} ${message}`)
  }

  return (await res.json()) as Exercise[]
}

export async function evaluateExercise(
  payload: ExerciseEvaluationRequest,
): Promise<ExerciseEvaluationResponse> {
  const res = await fetch(`${API_BASE}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to evaluate answer: ${res.status} ${message}`)
  }

  return (await res.json()) as ExerciseEvaluationResponse
}

// New combined endpoint
export async function requestLearningSectionsEnhanced(
  payload: LearningSectionsEnhancedRequest,
): Promise<LearningSectionsEnhancedResponse> {
  const res = await fetch(`${API_BASE}/api/learning-sections-enhanced`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to generate learning sections: ${res.status} ${message}`)
  }

  return (await res.json()) as LearningSectionsEnhancedResponse
}

// New on-demand exercise generation
export async function generateSectionExercise(
  payload: GenerateSectionExerciseRequest,
): Promise<GenerateSectionExerciseResponse> {
  const res = await fetch(`${API_BASE}/api/generate-section-exercise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to generate exercise: ${res.status} ${message}`)
  }

  return (await res.json()) as GenerateSectionExerciseResponse
}

// New knowledge gap material generation
export async function generateGapMaterial(
  payload: GenerateGapMaterialRequest,
): Promise<GenerateGapMaterialResponse> {
  const res = await fetch(`${API_BASE}/api/generate-gap-material`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to generate gap material: ${res.status} ${message}`)
  }

  return (await res.json()) as GenerateGapMaterialResponse
}

// New text selection explanation
export async function explainSelection(
  payload: ExplainSelectionRequest,
): Promise<ExplainSelectionResponse> {
  const res = await fetch(`${API_BASE}/api/explain-selection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to explain selection: ${res.status} ${message}`)
  }

  return (await res.json()) as ExplainSelectionResponse
}

// Answer follow-up question about an exercise
export async function answerExerciseFollowUp(
  payload: ExerciseFollowUpRequest,
): Promise<ExerciseFollowUpResponse> {
  const res = await fetch(`${API_BASE}/api/exercise-follow-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to answer follow-up question: ${res.status} ${message}`)
  }

  return (await res.json()) as ExerciseFollowUpResponse
}

// Keep old functions for migration (will be removed later)
export async function requestLearningSections(
  payload: LearningSectionsRequest,
): Promise<LearningSectionsResponse> {
  const res = await fetch(`${API_BASE}/api/learning-sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to generate learning sections: ${res.status} ${message}`)
  }

  return (await res.json()) as LearningSectionsResponse
}

export async function enhanceLearningSections(
  payload: LearningSectionsEnhancementRequest,
): Promise<LearningSectionsEnhancementResponse> {
  const res = await fetch(`${API_BASE}/api/learning-sections-enhancement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to enhance learning sections: ${res.status} ${message}`)
  }

  return (await res.json()) as LearningSectionsEnhancementResponse
}

export async function refinePracticeExercises(
  payload: PracticeExerciseRefinementRequest,
): Promise<PracticeExerciseRefinementResponse> {
  const res = await fetch(`${API_BASE}/api/practice-exercise-refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to refine practice exercises: ${res.status} ${message}`)
  }

  return (await res.json()) as PracticeExerciseRefinementResponse
}

export async function evaluatePracticeExercise(
  payload: PracticeExerciseEvaluationRequest,
): Promise<PracticeExerciseEvaluationResponse> {
  const res = await fetch(`${API_BASE}/api/practice-exercise-evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Failed to evaluate practice exercise: ${res.status} ${message}`)
  }

  return (await res.json()) as PracticeExerciseEvaluationResponse
}

export interface User {
  id: string
  email: string
  name: string
  picture?: string
}

export interface AuthStatus {
  authenticated: boolean
  user?: User
}

export async function checkAuth(): Promise<AuthStatus> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    credentials: 'include',
  })

  if (!res.ok) {
    return { authenticated: false }
  }

  return (await res.json()) as AuthStatus
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'GET',
    credentials: 'include',
  })
}

export async function saveLecture(lecture: import('./types').Lecture): Promise<void> {
  const res = await fetch(`${API_BASE}/api/lectures/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lecture }),
  })

  if (!res.ok) {
    throw new Error('Failed to save lecture')
  }
}

export async function loadLectures(): Promise<import('./types').Lecture[]> {
  const res = await fetch(`${API_BASE}/api/lectures`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error('Failed to load lectures')
  }

  const data = await res.json()
  return data.lectures || []
}

export async function deleteLecture(lectureId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/lectures/${lectureId}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error('Failed to delete lecture')
  }
}


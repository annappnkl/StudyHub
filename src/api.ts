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
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

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


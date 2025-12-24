export type ExerciseType = 'open-ended' | 'mcq'
export type LearningSectionFormat = 'process' | 'definition' | 'comparison' | 'framework' | 'concept' | 'method'

export interface MCQOption {
  id: string
  text: string
  isCorrect: boolean
}

export interface PracticeExercise {
  id: string
  prompt: string
  exampleScenario?: string
  userAnswer?: string
  evaluation?: {
    feedback: string
    score: number
    knowledgeGap?: string
  }
}

export interface LearningSectionContent {
  // For process/framework/method types
  process?: string[]
  // For all types
  explanation: string
  // For comparison types
  comparisonPoints?: Array<{ aspect: string; details: string }>
  // For framework types
  components?: Array<{ name: string; description: string }>
  // Example for all types
  example?: string
}

export interface LearningSection {
  id: string
  title: string
  format: LearningSectionFormat
  content: LearningSectionContent
  practiceExercises: PracticeExercise[] // Now empty by default, populated on-demand
  hasExerciseButton: boolean // Whether to show "Generate Exercise" button
  generatedExercise?: Exercise // Exercise generated on-demand
  knowledgeGapMaterial?: string // Material generated for knowledge gaps
}

export interface Exercise {
  id: string
  type: ExerciseType
  prompt: string
  options?: MCQOption[]
  solutionExplanation?: string
}

export interface HighlightedText {
  id: string
  sectionId: string
  text: string
  startOffset: number
  endOffset: number
  explanation?: string // Cached explanation
}

export interface Subchapter {
  id: string
  title: string
  content: string // Introduction/overview
  learningSections: LearningSection[] // Detailed learning materials
  exercises: Exercise[] // Quiz section (no explanations shown) - now on-demand
  isCompleted: boolean
  highlightedTexts?: HighlightedText[] // Track highlighted sections
  knowledgeGapMaterial?: string // Material generated for knowledge gaps (quiz level)
}

export interface Chapter {
  id: string
  title: string
  subchapters: Subchapter[]
  isUnlocked: boolean
}

export interface Lecture {
  id: string
  title: string
  goal: string
  createdAt: string
  chapters: Chapter[]
  currentChapterId?: string
  currentSubchapterId?: string
}

export interface LectureGenerationRequest {
  topic: string
  goal: string
  materialsSummary?: string
}

export interface StudyPlanGenerationResponse {
  lectureTitle: string
  chapters: {
    id: string
    title: string
    subchapters: {
      id: string
      title: string
      content: string
    }[]
  }[]
}

export interface ExerciseGenerationRequest {
  lectureTitle: string
  chapterTitle: string
  subchapterTitle: string
  subchapterContent: string
  goal: string
  learningSections?: LearningSection[]
}

export interface ExerciseEvaluationRequest {
  exercise: Exercise
  userAnswer: string
  goal: string
  subchapterContent: string
}

export interface ExerciseEvaluationResponse {
  isCorrect: boolean
  feedback: string
  knowledgeGap?: string
  score?: number
  correctOptionId?: string
}

export interface LearningSectionsRequest {
  subchapterContent: string
  goal: string
  subchapterTitle: string
}

export interface LearningSectionsResponse {
  learningSections: LearningSection[]
}

export interface LearningSectionsEnhancementRequest {
  learningSections: LearningSection[]
  goal: string
  subchapterTitle: string
}

export interface LearningSectionsEnhancementResponse {
  learningSections: LearningSection[]
}

export interface PracticeExerciseRefinementRequest {
  exercises: PracticeExercise[]
  learningSection: LearningSection
  goal: string
}

export interface PracticeExerciseRefinementResponse {
  exercises: PracticeExercise[]
}

export interface PracticeExerciseEvaluationRequest {
  exercise: PracticeExercise
  userAnswer: string
  learningSection: LearningSection
  goal: string
}

export interface PracticeExerciseEvaluationResponse {
  feedback: string
  score: number
  knowledgeGap?: string
}

export interface LearningSectionsEnhancedRequest {
  subchapterContent: string
  goal: string
  subchapterTitle: string
}

export interface LearningSectionsEnhancedResponse {
  learningSections: LearningSection[]
}

export interface GenerateSectionExerciseRequest {
  learningSection: LearningSection
  previousSections: LearningSection[]
  goal: string
}

export interface GenerateSectionExerciseResponse {
  exercise: Exercise
}

export interface GenerateGapMaterialRequest {
  knowledgeGap: string
  learningSection: LearningSection
  goal: string
}

export interface GenerateGapMaterialResponse {
  material: string
}

export interface ExplainSelectionRequest {
  selectedText: string
  surroundingContext?: string
  learningSection: LearningSection
  goal: string
}

export interface ExplainSelectionResponse {
  explanation: string
}

export interface ExerciseFollowUpRequest {
  exercise: Exercise
  followUpQuestion: string
  learningSection: LearningSection
  goal: string
}

export interface ExerciseFollowUpResponse {
  answer: string
}


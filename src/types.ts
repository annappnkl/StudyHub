export type ExerciseType = 'open-ended' | 'mcq'
export type LearningSectionFormat = 'process' | 'comparison' | 'framework' | 'concept' | 'method'
export type KnowledgeLevel = 'beginner' | 'intermediate' | 'advanced'

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
  content: string // Brief learning objectives (1-2 sentences)
  conceptOutline?: string[]  // List of concepts/frameworks that will be taught
  learningSections: LearningSection[] // Detailed learning materials (generated lazily)
  exercises: Exercise[] // Quiz section (no explanations shown) - now on-demand
  isCompleted: boolean
  highlightedTexts?: HighlightedText[] // Track highlighted sections
  knowledgeGapMaterial?: string // Material generated for knowledge gaps (quiz level)
}

export interface Chapter {
  id: string
  title: string
  description?: string  // Chapter's focus and learning progression context
  subchapters: Subchapter[]
  isUnlocked: boolean
}

export interface Lecture {
  id: string
  title: string
  goal: string
  createdAt: string
  chapters: Chapter[]
  conceptMap?: ConceptMap  // Concept coordination across chapters (prevents duplication)
  currentChapterId?: string
  currentSubchapterId?: string
  assessmentResults?: {
    skills: Array<{
      name: string
      knowledgeLevel: KnowledgeLevel
      assessmentScore: number // 0-1 based on swipe responses
    }>
    completedAt: string
  }
}

export interface LectureGenerationRequest {
  topic: string
  goal: string
  materialsSummary?: string
}

export interface ConceptMap {
  allConcepts: string[]  // All concepts taught across entire lecture
  chapterDistribution: Record<string, string[]>  // Which concepts belong to which chapter
}

export interface StudyPlanGenerationResponse {
  lectureTitle: string
  conceptMap: ConceptMap
  chapters: {
    id: string
    title: string
    description: string  // Chapter's focus and how it fits in learning progression
    subchapters: {
      id: string
      title: string
      conceptOutline: string[]  // List of concepts/frameworks that will be taught
      content: string  // Brief description of learning objectives (1-2 sentences)
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
  conceptMap?: ConceptMap  // For content coordination
  conceptOutline?: string[]  // Specific concepts assigned to this subchapter
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
  intent?: 'scenario-extension' | 'factual-explanation'
}

// Assessment System Interfaces
export interface Skill {
  id: string
  name: string
  category: string
  importance: 'high' | 'medium' | 'low'
  description: string
  relatedChapter?: string
}

export interface AssessmentQuestion {
  id: string
  skillId: string
  question: string
  skillName: string
  category: string
  relatedConcept?: string
}

export interface AssessmentResponse {
  questionId: string
  skillId: string
  knows: boolean // true for "know", false for "don't know"
}

export interface AssessmentResult {
  skillId: string
  skillName: string
  category: string
  score: number // 0-1 based on correct responses
  knowledgeLevel: KnowledgeLevel
  questionsAnswered: number
  questionsKnown: number
}

export interface GenerateSkillsRequest {
  topic: string
  goal: string
  lectureContent?: StudyPlanGenerationResponse  // Pass full plan for content-aware skill generation
}

export interface GenerateSkillsResponse {
  skills: Skill[]
}

export interface GenerateAssessmentRequest {
  skills: Skill[]
  goal: string
  lectureContent?: StudyPlanGenerationResponse  // Pass full plan for specific, content-aware questions
}

export interface GenerateAssessmentResponse {
  questions: AssessmentQuestion[]
}

export interface LearningSectionsEnhancedRequestWithAssessment extends LearningSectionsEnhancedRequest {
  knowledgeLevels?: Array<{
    skillName: string
    knowledgeLevel: KnowledgeLevel
    score: number
  }>
}


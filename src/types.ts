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
  // Example for all types (now optional with smart logic)
  example?: string
  // Reason why example was included (optional)
  exampleReason?: string
}

export interface ContentQuality {
  focusedOnPracticalApplication: boolean
  avoidedGenericExamples: boolean
  formatSpecificApproach: boolean
}

export interface PersonalizationInfo {
  wasPersonalized: boolean
  adjustedForSkills?: string[]
  adjustmentReason?: string
  knowledgeLevelFocus?: KnowledgeLevel
}

export interface OverallPersonalizationInfo {
  totalSectionsPersonalized: number
  primaryAdjustmentReasons: string[]
  knowledgeLevelsAddressed: KnowledgeLevel[]
}

// Chapter Testing System Types
export interface TestQuestion {
  id: string
  type: 'mcq' | 'short-answer' | 'scenario-based' | 'integration'
  prompt: string
  detailedScenario?: string // Rich company/situation description for scenario-based questions
  options?: MCQOption[] // For MCQ questions
  expectedAnswerLength: 'brief' | 'moderate' | 'comprehensive'
  relatedSections: string[] // Learning sections this tests
  difficulty: KnowledgeLevel
  maxPoints: number
  evaluationCriteria: string[] // What to look for in answers
}

export interface ChapterTest {
  id: string
  chapterId: string
  title: string
  estimatedTimeMinutes: number
  questions: TestQuestion[]
  totalPoints: number
  adaptedForUser?: {
    focusedOnWeakAreas: string[]
    difficultyAdjustments: string
  }
  userResults?: ChapterTestResult
}

export interface ChapterTestResult {
  testId: string
  userId: string
  completedAt: string
  answers: TestAnswer[]
  totalScore: number
  maxScore: number
  percentageScore: number
  timeSpentMinutes: number
  feedback: TestFeedback
}

export interface TestAnswer {
  questionId: string
  userAnswer: string
  selectedOptionId?: string // For MCQ questions
  score: number
  maxScore: number
  feedback: string
  isCorrect?: boolean // For MCQ questions
}

export interface TestFeedback {
  overallPerformance: string
  strengths: string[]
  areasForImprovement: string[]
  recommendedActions: string[]
  masteryLevel: KnowledgeLevel
}

export interface UserExerciseHistoryItem {
  sectionTitle: string
  success: boolean
  score?: number
  attempts?: number
}

// API Request/Response Types for Chapter Testing
export interface GenerateChapterTestRequest {
  chapterData: Chapter & {
    subchapters: (Subchapter & {
      learningSections: LearningSection[]
    })[]
  }
  userExerciseHistory?: UserExerciseHistoryItem[]
  assessmentResults?: Array<{
    skillName: string
    knowledgeLevel: KnowledgeLevel
    assessmentScore: number
  }>
  goal: string
}

export interface GenerateChapterTestResponse {
  test: ChapterTest
}

export interface EvaluateChapterTestRequest {
  test: ChapterTest
  answers: TestAnswer[]
  timeSpentMinutes: number
  goal: string
  userAssessmentResults?: Array<{
    skillName: string
    knowledgeLevel: KnowledgeLevel
    assessmentScore: number
  }>
}

export interface EvaluateChapterTestResponse {
  totalScore: number
  maxScore: number
  percentageScore: number
  timeEfficiency: 'excellent' | 'good' | 'adequate' | 'needs_improvement'
  answers: Array<{
    questionId: string
    score: number
    maxScore: number
    isCorrect?: boolean
    feedback: string
    strengths: string[]
    improvements: string[]
    correctAnswer?: string
  }>
  overallFeedback: {
    overallPerformance: string
    strengths: string[]
    areasForImprovement: string[]
    recommendedActions: string[]
    masteryLevel: KnowledgeLevel
    performanceInsights: {
      bestPerformingAreas: string[]
      strugglingAreas: string[]
      frameworkApplication: string
      conceptualUnderstanding: string
      practicalApplication: string
    }
  }
  nextSteps: {
    shouldRetakeTest: boolean
    suggestedReviewSections: string[]
    readyForAdvanced: boolean
    estimatedStudyTime: string
  }
  evaluatedAt: string
  testId: string
  evaluationVersion: string
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
  contentQuality?: ContentQuality // Quality metrics from smart generation
  personalization?: PersonalizationInfo // Personalization tracking metadata
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
  overallPersonalization?: OverallPersonalizationInfo // Personalization summary for this subchapter
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
  overallPersonalization?: OverallPersonalizationInfo
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


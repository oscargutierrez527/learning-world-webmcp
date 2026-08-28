export type DaxAttemptResult = 'correct' | 'incorrect'

export interface DaxSalesRow {
  region: string
  amount: number
}

export interface DaxFilterContext {
  column: string
  value: string
}

export interface DaxExercise {
  id: string
  datasetName: string
  salesRows: DaxSalesRow[]
  filterContext: DaxFilterContext
  measure: string
  question: string
  expectedAnswer: number
  reasoningSteps: string[]
}

export interface DaxEvaluation {
  result: DaxAttemptResult
}

export interface DaxAttempt {
  id: string
  exerciseId: string
  submittedAnswer: number
  result: DaxAttemptResult
  sequenceNumber: number
}

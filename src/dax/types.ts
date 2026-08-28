export type DaxAttemptResult = 'correct' | 'incorrect'

export type DaxSkillId = 'S1' | 'S2' | 'S3' | 'S4'

export type DaxDataColumnKey = 'region' | 'channel' | 'segment' | 'amount'

export interface DaxDataColumn {
  key: DaxDataColumnKey
  label: string
}

export interface DaxDataRow {
  region: string
  channel?: string
  segment?: string
  amount: number
}

export interface DaxFilterContext {
  column: string
  value: string
}

export interface DaxExercise {
  id: string
  sequenceNumber: number
  stageLabel: string
  datasetName: string
  dataColumns: DaxDataColumn[]
  dataRows: DaxDataRow[]
  filterContext: DaxFilterContext[]
  measure: string
  question: string
  expectedAnswer: number
  reasoningSteps: string[]
  incorrectFeedback: string
  skillIds: DaxSkillId[]
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

export interface DaxSkill {
  id: DaxSkillId
  name: string
}

export interface DaxLearningEvidence {
  id: string
  skillId: DaxSkillId
  exerciseId: string
  attemptId: string
}

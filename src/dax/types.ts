export type DaxAttemptResult = 'correct' | 'incorrect'

export type DaxSkillId =
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
  | 'S6'
  | 'S7'
  | 'S8'

export type DaxDataColumnKey =
  | 'region'
  | 'channel'
  | 'segment'
  | 'market'
  | 'customerId'
  | 'amount'

export interface DaxDataColumn {
  key: DaxDataColumnKey
  label: string
}

export type DaxDataRow = Partial<
  Record<DaxDataColumnKey, string | number>
>

export interface DaxDataset {
  name: string
  columns: DaxDataColumn[]
  rows: DaxDataRow[]
}

export interface DaxModelRelationship {
  fromTable: string
  fromColumn: string
  fromCardinality: 'one'
  toTable: string
  toColumn: string
  toCardinality: 'many'
  filterDirection: string
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
  relatedDatasets?: DaxDataset[]
  relationship?: DaxModelRelationship
  filterContext: DaxFilterContext[]
  measure: string
  question: string
  expectedAnswer: number
  reasoningSteps: string[]
  incorrectFeedback: string
  socraticBeforeAttempt: string
  socraticAfterIncorrect: string
  conceptExplanation: string
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

export type DaxAgentSupportType = 'socratic' | 'explanation'

export interface DaxAgentSupport {
  type: DaxAgentSupportType
  exerciseId: string
  learnerState: 'not_attempted' | 'incorrect' | 'solved'
  text: string
}

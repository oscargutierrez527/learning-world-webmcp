export type DaxAttemptResult = 'correct' | 'incorrect'

export type DaxMisconceptionId =
  | 'M02'
  | 'M03'
  | 'M04'
  | 'M05'
  | 'M06'
  | 'M07'
  | 'M08'
  | 'M09'
  | 'M10'

export interface DaxPossibleMisconception {
  id: DaxMisconceptionId
  label: string
}

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
  filterOperation: string
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

export type DaxLearnerState = 'not_attempted' | 'incorrect' | 'solved'

export type DaxSupportMode = 'socratic' | 'explanation' | 'filter_trace'

export interface DaxTextSupport {
  type: 'socratic' | 'explanation'
  exerciseId: string
  learnerState: DaxLearnerState
  text: string
  possibleMisconception: DaxPossibleMisconception | null
}

export interface DaxFilterTrace {
  type: 'filter_trace'
  mode: 'filter_trace'
  exerciseId: string
  learnerState: DaxLearnerState
  beforeFilters: string[]
  operation: string
  focus: string[]
  possibleMisconception: DaxPossibleMisconception | null
  complete: boolean
  establishedReasoning?: string[]
  result?: number
}

export type DaxAgentSupport = DaxTextSupport | DaxFilterTrace

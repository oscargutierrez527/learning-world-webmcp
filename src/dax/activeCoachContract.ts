import { daxExercises } from './exercise'
import { daxMisconceptions } from './misconceptions'
import type {
  DaxMisconceptionId,
  DaxPossibleMisconception,
  DaxSkillId,
  DaxSupportMode,
} from './types'

export const DAX_COACH_MISSION_ID = 'dax-calculate-filter-context'

export const daxCoachInterventions = [
  'socratic',
  'explanation',
  'filter_trace',
] as const satisfies readonly DaxSupportMode[]

export type DaxCoachIntervention = (typeof daxCoachInterventions)[number]

export interface DaxCoachAttemptSnapshot {
  attemptId: string
  sequenceNumber: number
  submittedAnswer: number
  evaluation: 'incorrect'
  possibleMisconception: DaxPossibleMisconception | null
}

export interface DaxCoachSnapshot {
  missionId: typeof DAX_COACH_MISSION_ID
  exercise: {
    id: string
    concept: string
    activeFilterContext: Array<{ column: string; value: string }>
    daxExpression: string
    filterOperation: string
    relationshipSummary: string | null
  }
  currentAttempt: DaxCoachAttemptSnapshot
  recentAttempts: DaxCoachAttemptSnapshot[]
  possibleMisconception: DaxPossibleMisconception | null
  demonstratedSkillIds: DaxSkillId[]
  priorInterventions: DaxCoachIntervention[]
}

export interface DaxCoachSelection {
  intervention: DaxCoachIntervention
}

export type DaxCoachSnapshotValidation =
  | { valid: true; snapshot: DaxCoachSnapshot }
  | { valid: false; reason: string }

const daxSkillIds: DaxSkillId[] = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
]

const daxMisconceptionIds: DaxMisconceptionId[] = [
  'M02',
  'M03',
  'M04',
  'M05',
  'M06',
  'M07',
  'M08',
  'M09',
  'M10',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actualKeys = Object.keys(value).sort()
  const expectedKeys = [...keys].sort()
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  )
}

function getRelationshipSummary(exerciseId: string) {
  const relationship = daxExercises.find(({ id }) => id === exerciseId)
    ?.relationship
  if (!relationship) {
    return null
  }

  return `${relationship.fromTable}[${relationship.fromColumn}] 1 → * ${relationship.toTable}[${relationship.toColumn}]; ${relationship.filterDirection}`
}

function isKnownMisconception(
  value: unknown,
): value is DaxPossibleMisconception | null {
  if (value === null) {
    return true
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'label']) ||
    typeof value.id !== 'string' ||
    !daxMisconceptionIds.includes(value.id as DaxMisconceptionId) ||
    typeof value.label !== 'string'
  ) {
    return false
  }

  return daxMisconceptions[value.id as DaxMisconceptionId].label === value.label
}

function isValidAttemptSnapshot(
  value: unknown,
  exerciseId: string,
): value is DaxCoachAttemptSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'attemptId',
      'evaluation',
      'possibleMisconception',
      'sequenceNumber',
      'submittedAnswer',
    ]) ||
    typeof value.attemptId !== 'string' ||
    !Number.isInteger(value.sequenceNumber) ||
    (value.sequenceNumber as number) < 1 ||
    (value.sequenceNumber as number) > 10_000 ||
    value.attemptId !== `${exerciseId}-attempt-${value.sequenceNumber}` ||
    typeof value.submittedAnswer !== 'number' ||
    !Number.isFinite(value.submittedAnswer) ||
    Math.abs(value.submittedAnswer) > 1_000_000_000 ||
    value.evaluation !== 'incorrect' ||
    !isKnownMisconception(value.possibleMisconception)
  ) {
    return false
  }

  return true
}

export function isDaxCoachIntervention(
  value: unknown,
): value is DaxCoachIntervention {
  return (
    typeof value === 'string' &&
    daxCoachInterventions.includes(value as DaxCoachIntervention)
  )
}

export function parseDaxCoachSelection(value: unknown): DaxCoachSelection | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['intervention']) ||
    !isDaxCoachIntervention(value.intervention)
  ) {
    return null
  }

  return { intervention: value.intervention }
}

export function validateDaxCoachSnapshot(
  value: unknown,
): DaxCoachSnapshotValidation {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'currentAttempt',
      'demonstratedSkillIds',
      'exercise',
      'missionId',
      'possibleMisconception',
      'priorInterventions',
      'recentAttempts',
    ]) ||
    value.missionId !== DAX_COACH_MISSION_ID ||
    !isRecord(value.exercise) ||
    !hasExactKeys(value.exercise, [
      'activeFilterContext',
      'concept',
      'daxExpression',
      'filterOperation',
      'id',
      'relationshipSummary',
    ]) ||
    typeof value.exercise.id !== 'string'
  ) {
    return { valid: false, reason: 'invalid_shape' }
  }

  const exerciseValue = value.exercise
  const exercise = daxExercises.find(({ id }) => id === exerciseValue.id)
  if (!exercise) {
    return { valid: false, reason: 'unknown_exercise' }
  }

  const expectedFilterContext = exercise.filterContext.map(
    ({ column, value: filterValue }) => ({ column, value: filterValue }),
  )
  if (
    exerciseValue.concept !== exercise.stageLabel ||
    exerciseValue.daxExpression !== exercise.measure ||
    exerciseValue.filterOperation !== exercise.filterOperation ||
    exerciseValue.relationshipSummary !== getRelationshipSummary(exercise.id) ||
    JSON.stringify(exerciseValue.activeFilterContext) !==
      JSON.stringify(expectedFilterContext)
  ) {
    return { valid: false, reason: 'invalid_exercise_context' }
  }

  if (!isValidAttemptSnapshot(value.currentAttempt, exercise.id)) {
    return { valid: false, reason: 'invalid_current_attempt' }
  }

  if (
    !Array.isArray(value.recentAttempts) ||
    value.recentAttempts.length < 1 ||
    value.recentAttempts.length > 4 ||
    !value.recentAttempts.every((attempt) =>
      isValidAttemptSnapshot(attempt, exercise.id),
    )
  ) {
    return { valid: false, reason: 'invalid_attempt_trajectory' }
  }

  const recentAttempts = value.recentAttempts as DaxCoachAttemptSnapshot[]
  if (
    recentAttempts.some(
      (attempt, index) =>
        index > 0 &&
        attempt.sequenceNumber <= recentAttempts[index - 1].sequenceNumber,
    ) ||
    JSON.stringify(recentAttempts.at(-1)) !==
      JSON.stringify(value.currentAttempt)
  ) {
    return { valid: false, reason: 'invalid_attempt_trajectory' }
  }

  if (
    !isKnownMisconception(value.possibleMisconception) ||
    JSON.stringify(value.possibleMisconception) !==
      JSON.stringify(value.currentAttempt.possibleMisconception)
  ) {
    return { valid: false, reason: 'invalid_misconception' }
  }

  if (
    !Array.isArray(value.demonstratedSkillIds) ||
    value.demonstratedSkillIds.length > daxSkillIds.length ||
    !value.demonstratedSkillIds.every(
      (skillId) =>
        typeof skillId === 'string' &&
        daxSkillIds.includes(skillId as DaxSkillId),
    ) ||
    new Set(value.demonstratedSkillIds).size !==
      value.demonstratedSkillIds.length
  ) {
    return { valid: false, reason: 'invalid_skills' }
  }

  if (
    !Array.isArray(value.priorInterventions) ||
    value.priorInterventions.length > 4 ||
    !value.priorInterventions.every(isDaxCoachIntervention)
  ) {
    return { valid: false, reason: 'invalid_intervention_trajectory' }
  }

  return { valid: true, snapshot: value as unknown as DaxCoachSnapshot }
}

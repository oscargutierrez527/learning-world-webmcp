import { evaluateDaxPrediction } from './evaluation'
import { daxExercises } from './exercise'
import type { DaxAttempt } from './types'

export const DAX_MISSION_STORAGE_KEY =
  'learning-world:dax-calculate-filter-context:v1'

interface StoredDaxMissionV1 {
  version: 1
  attempts: DaxAttempt[]
  currentExerciseId: string
}

export interface RestoredDaxMissionState {
  attempts: DaxAttempt[]
  currentExerciseIndex: number
}

function getFreshDaxMissionState(): RestoredDaxMissionState {
  return {
    attempts: [],
    currentExerciseIndex: 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeAttempts(value: unknown): {
  attempts: DaxAttempt[]
  lastExerciseIndex: number
  lastExerciseSolved: boolean
} | null {
  if (!Array.isArray(value)) {
    return null
  }

  let lastExerciseIndex = 0
  let lastExerciseSolved = false
  const attempts: DaxAttempt[] = []

  for (const [index, valueAttempt] of value.entries()) {
    if (!isRecord(valueAttempt)) {
      return null
    }

    const { id, exerciseId, submittedAnswer, result, sequenceNumber } =
      valueAttempt
    if (
      typeof id !== 'string' ||
      typeof exerciseId !== 'string' ||
      typeof submittedAnswer !== 'number' ||
      !Number.isFinite(submittedAnswer) ||
      (result !== 'correct' && result !== 'incorrect') ||
      !Number.isInteger(sequenceNumber) ||
      sequenceNumber !== index + 1 ||
      id !== `${exerciseId}-attempt-${sequenceNumber}`
    ) {
      return null
    }

    const exerciseIndex = daxExercises.findIndex(
      (exercise) => exercise.id === exerciseId,
    )
    if (exerciseIndex < 0) {
      return null
    }

    if (exerciseIndex === lastExerciseIndex) {
      if (lastExerciseSolved) {
        return null
      }
    } else if (
      exerciseIndex === lastExerciseIndex + 1 &&
      lastExerciseSolved
    ) {
      lastExerciseIndex = exerciseIndex
      lastExerciseSolved = false
    } else {
      return null
    }

    const evaluation = evaluateDaxPrediction(
      daxExercises[exerciseIndex],
      submittedAnswer,
    )
    const sanitizedAttempt: DaxAttempt = {
      id,
      exerciseId,
      submittedAnswer,
      result: evaluation.result,
      sequenceNumber,
    }

    attempts.push(sanitizedAttempt)
    if (evaluation.result === 'correct') {
      lastExerciseSolved = true
    }
  }

  return { attempts, lastExerciseIndex, lastExerciseSolved }
}

function getRestoredState(value: unknown): RestoredDaxMissionState | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.currentExerciseId !== 'string'
  ) {
    return null
  }

  const sanitized = sanitizeAttempts(value.attempts)
  if (!sanitized) {
    return null
  }

  const currentExerciseIndex = daxExercises.findIndex(
    ({ id }) => id === value.currentExerciseId,
  )
  if (currentExerciseIndex < 0) {
    return null
  }

  const { attempts, lastExerciseIndex, lastExerciseSolved } = sanitized
  const canRemainOnSolvedExercise =
    lastExerciseSolved && currentExerciseIndex === lastExerciseIndex
  const canAdvanceAfterSolvedExercise =
    lastExerciseSolved &&
    lastExerciseIndex < daxExercises.length - 1 &&
    currentExerciseIndex === lastExerciseIndex + 1
  const isCurrentUnsolvedExercise =
    !lastExerciseSolved && currentExerciseIndex === lastExerciseIndex

  if (
    !canRemainOnSolvedExercise &&
    !canAdvanceAfterSolvedExercise &&
    !isCurrentUnsolvedExercise
  ) {
    return null
  }

  return { attempts, currentExerciseIndex }
}

export function restoreDaxMissionState(
  storage?: Storage,
): RestoredDaxMissionState {
  let activeStorage = storage

  try {
    activeStorage ??= window.localStorage
    const storedValue = activeStorage.getItem(DAX_MISSION_STORAGE_KEY)
    if (!storedValue) {
      return getFreshDaxMissionState()
    }

    const restoredState = getRestoredState(JSON.parse(storedValue))
    if (restoredState) {
      return restoredState
    }

    activeStorage.removeItem(DAX_MISSION_STORAGE_KEY)
  } catch {
    try {
      activeStorage?.removeItem(DAX_MISSION_STORAGE_KEY)
    } catch {
      // Browser storage may be unavailable; the mission still starts fresh.
    }
  }

  return getFreshDaxMissionState()
}

export function persistDaxMissionState(
  attempts: DaxAttempt[],
  currentExerciseId: string,
  storage?: Storage,
) {
  const storedState: StoredDaxMissionV1 = {
    version: 1,
    attempts: attempts.map(
      ({ id, exerciseId, submittedAnswer, result, sequenceNumber }) => ({
        id,
        exerciseId,
        submittedAnswer,
        result,
        sequenceNumber,
      }),
    ),
    currentExerciseId,
  }

  try {
    const activeStorage = storage ?? window.localStorage
    activeStorage.setItem(DAX_MISSION_STORAGE_KEY, JSON.stringify(storedState))
  } catch {
    // Persistence is progressive enhancement; learning remains usable in memory.
  }
}

export function clearDaxMissionState(storage?: Storage) {
  try {
    const activeStorage = storage ?? window.localStorage
    activeStorage.removeItem(DAX_MISSION_STORAGE_KEY)
  } catch {
    // Persistence is progressive enhancement; in-memory reset still succeeds.
  }
}

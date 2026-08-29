// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { daxExercises } from './exercise'
import {
  deriveDaxLearningEvidence,
  getDemonstratedDaxSkillIds,
  isDaxMissionMastered,
} from './learning'
import { identifyDaxMisconception } from './misconceptions'
import {
  DAX_MISSION_STORAGE_KEY,
  persistDaxMissionState,
  restoreDaxMissionState,
} from './persistence'
import type { DaxAttempt } from './types'

function createAttempt(
  exerciseIndex: number,
  submittedAnswer: number,
  sequenceNumber: number,
): DaxAttempt {
  const exercise = daxExercises[exerciseIndex]
  return {
    id: `${exercise.id}-attempt-${sequenceNumber}`,
    exerciseId: exercise.id,
    submittedAnswer,
    result:
      submittedAnswer === exercise.expectedAnswer ? 'correct' : 'incorrect',
    sequenceNumber,
  }
}

function createCompletedMissionAttempts(): DaxAttempt[] {
  return daxExercises.map((exercise, index) =>
    createAttempt(index, exercise.expectedAnswer, index + 1),
  )
}

beforeEach(() => localStorage.clear())

describe('DAX mission persistence', () => {
  it('persists only the versioned attempt history and current exercise', () => {
    const attempts = [createAttempt(0, 450, 1)]

    persistDaxMissionState(attempts, 'DAX-02')

    const stored = JSON.parse(localStorage.getItem(DAX_MISSION_STORAGE_KEY)!)
    expect(stored).toEqual({
      version: 1,
      attempts,
      currentExerciseId: 'DAX-02',
    })
    expect(stored).not.toHaveProperty('mastered')
    expect(stored).not.toHaveProperty('missionComplete')
    expect(stored).not.toHaveProperty('evidence')
    expect(stored).not.toHaveProperty('agentSupport')
  })

  it('restores valid attempts and the current exercise position', () => {
    const attempts = [
      createAttempt(0, 250, 1),
      createAttempt(0, 450, 2),
      createAttempt(1, 0, 3),
    ]
    persistDaxMissionState(attempts, 'DAX-02')

    expect(restoreDaxMissionState()).toEqual({
      attempts,
      currentExerciseIndex: 1,
    })
  })

  it('regenerates evidence only from restored correct attempts', () => {
    const attempts = [
      createAttempt(0, 450, 1),
      createAttempt(1, 0, 2),
    ]
    persistDaxMissionState(attempts, 'DAX-02')

    const restored = restoreDaxMissionState()
    const evidence = deriveDaxLearningEvidence(restored.attempts)

    expect(getDemonstratedDaxSkillIds(evidence)).toEqual(new Set(['S1', 'S2']))
    expect(evidence.every(({ exerciseId }) => exerciseId === 'DAX-01')).toBe(
      true,
    )
    expect(isDaxMissionMastered(evidence)).toBe(false)
  })

  it('restores mapped possible misconceptions through deterministic derivation', () => {
    const attempts = [
      createAttempt(0, 450, 1),
      createAttempt(1, 300, 2),
      createAttempt(2, 500, 3),
    ]
    persistDaxMissionState(attempts, 'DAX-03')

    const restoredAttempt = restoreDaxMissionState().attempts.at(-1)!
    expect(
      identifyDaxMisconception(
        daxExercises[2],
        restoredAttempt.submittedAnswer,
        restoredAttempt.result,
      ),
    ).toMatchObject({ id: 'M02' })
    expect(
      deriveDaxLearningEvidence([restoredAttempt]),
    ).toHaveLength(0)
  })

  it('derives completed mastery again after restoring the full mission', () => {
    const attempts = createCompletedMissionAttempts()
    persistDaxMissionState(attempts, 'DAX-12')

    const restored = restoreDaxMissionState()
    const evidence = deriveDaxLearningEvidence(restored.attempts)
    const solvedExerciseIds = new Set(
      restored.attempts
        .filter(({ result }) => result === 'correct')
        .map(({ exerciseId }) => exerciseId),
    )

    expect(restored.attempts).toHaveLength(12)
    expect(getDemonstratedDaxSkillIds(evidence)).toHaveLength(8)
    expect(isDaxMissionMastered(evidence)).toBe(true)
    expect(solvedExerciseIds.size).toBe(12)
  })

  it.each([
    ['malformed JSON', '{not-json'],
    [
      'an unsupported version',
      JSON.stringify({ version: 2, attempts: [], currentExerciseId: 'DAX-01' }),
    ],
    [
      'an unknown current exercise',
      JSON.stringify({
        version: 1,
        attempts: [],
        currentExerciseId: 'DAX-99',
      }),
    ],
    [
      'an unknown attempt exercise',
      JSON.stringify({
        version: 1,
        attempts: [
          {
            id: 'DAX-99-attempt-1',
            exerciseId: 'DAX-99',
            submittedAnswer: 450,
            result: 'correct',
            sequenceNumber: 1,
          },
        ],
        currentExerciseId: 'DAX-01',
      }),
    ],
    [
      'a malformed numeric attempt',
      JSON.stringify({
        version: 1,
        attempts: [
          {
            id: 'DAX-01-attempt-1',
            exerciseId: 'DAX-01',
            submittedAnswer: '450',
            result: 'correct',
            sequenceNumber: 1,
          },
        ],
        currentExerciseId: 'DAX-01',
      }),
    ],
    [
      'an impossible skipped exercise path',
      JSON.stringify({
        version: 1,
        attempts: [
          {
            id: 'DAX-02-attempt-1',
            exerciseId: 'DAX-02',
            submittedAnswer: 300,
            result: 'correct',
            sequenceNumber: 1,
          },
        ],
        currentExerciseId: 'DAX-02',
      }),
    ],
  ])('starts safely when storage contains %s', (_label, storedValue) => {
    localStorage.setItem(DAX_MISSION_STORAGE_KEY, storedValue)

    expect(restoreDaxMissionState()).toEqual({
      attempts: [],
      currentExerciseIndex: 0,
    })
    expect(localStorage.getItem(DAX_MISSION_STORAGE_KEY)).toBeNull()
  })

  it('re-evaluates stored results and does not trust stored mastery flags', () => {
    const wrongAttempt = createAttempt(0, 250, 1)
    localStorage.setItem(
      DAX_MISSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        attempts: [{ ...wrongAttempt, result: 'correct' }],
        currentExerciseId: 'DAX-01',
        mastered: true,
        missionComplete: true,
      }),
    )

    const restored = restoreDaxMissionState()
    const evidence = deriveDaxLearningEvidence(restored.attempts)

    expect(restored.attempts[0].result).toBe('incorrect')
    expect(evidence).toEqual([])
    expect(isDaxMissionMastered(evidence)).toBe(false)
  })

  it('keeps the mission usable when browser storage is unavailable', () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error('storage blocked')
      },
      removeItem: () => {
        throw new Error('storage blocked')
      },
      setItem: () => {
        throw new Error('storage blocked')
      },
    } as unknown as Storage

    expect(restoreDaxMissionState(unavailableStorage)).toEqual({
      attempts: [],
      currentExerciseIndex: 0,
    })
    expect(() =>
      persistDaxMissionState([], 'DAX-01', unavailableStorage),
    ).not.toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { daxExercises } from './exercise'
import {
  deriveDaxLearningEvidence,
  isDaxMissionMastered,
} from './learning'
import { identifyDaxMisconception } from './misconceptions'
import type { DaxAttempt, DaxMisconceptionId } from './types'

const knownDistractors: Array<[string, number, DaxMisconceptionId]> = [
  ['DAX-01', 250, 'M03'],
  ['DAX-02', 0, 'M04'],
  ['DAX-02', 200, 'M06'],
  ['DAX-03', 500, 'M02'],
  ['DAX-03', 100, 'M03'],
  ['DAX-04', 0, 'M04'],
  ['DAX-04', 400, 'M05'],
  ['DAX-04', 120, 'M06'],
  ['DAX-05', 650, 'M02'],
  ['DAX-05', 110, 'M03'],
  ['DAX-06', 250, 'M06'],
  ['DAX-07', 250, 'M07'],
  ['DAX-07', 150, 'M07'],
  ['DAX-08', 450, 'M08'],
  ['DAX-09', 300, 'M09'],
  ['DAX-10', 250, 'M10'],
  ['DAX-11', 150, 'M03'],
  ['DAX-11', 300, 'M06'],
  ['DAX-12', 600, 'M02'],
  ['DAX-12', 90, 'M03'],
]

function exercise(exerciseId: string) {
  const daxExercise = daxExercises.find(({ id }) => id === exerciseId)
  expect(daxExercise).toBeDefined()
  return daxExercise!
}

describe('DAX possible misconception derivation', () => {
  it.each(knownDistractors)(
    'maps %s answer %s to %s',
    (exerciseId, submittedAnswer, expectedId) => {
      expect(
        identifyDaxMisconception(
          exercise(exerciseId),
          submittedAnswer,
          'incorrect',
        ),
      ).toMatchObject({ id: expectedId })
    },
  )

  it('returns null for arbitrary unmapped incorrect answers', () => {
    for (const daxExercise of daxExercises) {
      expect(
        identifyDaxMisconception(daxExercise, -987654, 'incorrect'),
      ).toBeNull()
    }
  })

  it('returns null for correct answers even if the number is mapped elsewhere', () => {
    expect(
      identifyDaxMisconception(exercise('DAX-03'), 500, 'correct'),
    ).toBeNull()
  })

  it('derives the same signal deterministically from exercise, answer, and evaluation', () => {
    const inputs = [exercise('DAX-03'), 500, 'incorrect'] as const

    expect(identifyDaxMisconception(...inputs)).toEqual(
      identifyDaxMisconception(...inputs),
    )
  })

  it('does not turn a mapped incorrect attempt into evidence or mastery', () => {
    const mappedAttempt: DaxAttempt = {
      id: 'DAX-03-attempt-1',
      exerciseId: 'DAX-03',
      submittedAnswer: 500,
      result: 'incorrect',
      sequenceNumber: 1,
    }
    const possibleMisconception = identifyDaxMisconception(
      exercise('DAX-03'),
      mappedAttempt.submittedAnswer,
      mappedAttempt.result,
    )
    const evidence = deriveDaxLearningEvidence([mappedAttempt])

    expect(possibleMisconception).toMatchObject({ id: 'M02' })
    expect(evidence).toEqual([])
    expect(isDaxMissionMastered(evidence)).toBe(false)
  })
})

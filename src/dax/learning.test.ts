import { describe, expect, it } from 'vitest'
import { daxExercises } from './exercise'
import {
  deriveDaxLearningEvidence,
  getDemonstratedDaxSkillIds,
  isDaxMissionMastered,
  requiredDaxSkills,
} from './learning'
import type { DaxAttempt, DaxSkillId } from './types'

function attempt(
  exerciseId: string,
  result: DaxAttempt['result'],
  sequenceNumber: number,
): DaxAttempt {
  return {
    id: `${exerciseId}-attempt-${sequenceNumber}`,
    exerciseId,
    submittedAnswer: result === 'correct' ? 1 : 0,
    result,
    sequenceNumber,
  }
}

const expectedEvidence: Record<string, DaxSkillId[]> = {
  'DAX-01': ['S1', 'S2'],
  'DAX-02': ['S1', 'S3'],
  'DAX-03': ['S2', 'S4'],
  'DAX-04': ['S3', 'S4'],
  'DAX-05': ['S2', 'S4'],
  'DAX-06': ['S4', 'S5'],
  'DAX-07': ['S3', 'S5'],
  'DAX-08': ['S6'],
  'DAX-09': ['S7'],
  'DAX-10': ['S8'],
  'DAX-11': ['S2', 'S4', 'S5'],
  'DAX-12': ['S1', 'S2', 'S4'],
}

describe('DAX learning evidence and mastery', () => {
  it('uses exactly the eight required DAX skills', () => {
    expect(requiredDaxSkills.map(({ id }) => id)).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S8',
    ])
  })

  it('defines the intended valid evidence mapping for every exercise', () => {
    const requiredSkillIds = new Set(requiredDaxSkills.map(({ id }) => id))

    expect(daxExercises).toHaveLength(12)
    expect(Object.keys(expectedEvidence)).toHaveLength(12)

    for (const exercise of daxExercises) {
      expect(exercise.skillIds).toEqual(expectedEvidence[exercise.id])
      expect(exercise.skillIds.length).toBeGreaterThan(0)
      expect(exercise.skillIds.every((id) => requiredSkillIds.has(id))).toBe(
        true,
      )
    }
  })

  it('derives evidence for every skill attached to a correct exercise attempt', () => {
    const evidence = deriveDaxLearningEvidence([
      attempt('DAX-01', 'correct', 1),
    ])

    expect(evidence.map(({ skillId }) => skillId)).toEqual(['S1', 'S2'])
    expect(
      evidence.every(({ attemptId }) => attemptId === 'DAX-01-attempt-1'),
    ).toBe(true)
  })

  it('does not derive evidence from an incorrect attempt', () => {
    expect(
      deriveDaxLearningEvidence([attempt('DAX-12', 'incorrect', 1)]),
    ).toEqual([])
  })

  it('does not grant mastery when a required skill is missing', () => {
    const evidence = deriveDaxLearningEvidence([
      attempt('DAX-01', 'correct', 1),
      attempt('DAX-12', 'correct', 2),
    ])

    expect(isDaxMissionMastered(evidence)).toBe(false)
  })

  it('keeps mastery false with S1-S8 demonstrated before DAX-12 transfer', () => {
    const evidence = deriveDaxLearningEvidence(
      daxExercises
        .slice(0, 11)
        .map((exercise, index) => attempt(exercise.id, 'correct', index + 1)),
    )

    expect(getDemonstratedDaxSkillIds(evidence)).toEqual(
      new Set(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']),
    )
    expect(isDaxMissionMastered(evidence)).toBe(false)
  })

  it('grants mastery only after S1-S8 and DAX-12 transfer are demonstrated', () => {
    const evidence = deriveDaxLearningEvidence(
      daxExercises.map((exercise, index) =>
        attempt(exercise.id, 'correct', index + 1),
      ),
    )

    expect(getDemonstratedDaxSkillIds(evidence)).toEqual(
      new Set(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']),
    )
    expect(isDaxMissionMastered(evidence)).toBe(true)
  })
})

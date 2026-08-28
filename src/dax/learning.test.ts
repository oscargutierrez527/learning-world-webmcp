import { describe, expect, it } from 'vitest'
import {
  deriveDaxLearningEvidence,
  isDaxMissionMastered,
} from './learning'
import type { DaxAttempt } from './types'

function attempt(
  exerciseId: string,
  result: DaxAttempt['result'],
  sequenceNumber: number,
): DaxAttempt {
  return {
    id: `${exerciseId}-attempt-${sequenceNumber}`,
    exerciseId,
    submittedAnswer: result === 'correct' ? 300 : 0,
    result,
    sequenceNumber,
  }
}

describe('DAX learning evidence and mastery', () => {
  it('derives evidence for every skill attached to a correct exercise attempt', () => {
    const evidence = deriveDaxLearningEvidence([
      attempt('C2-01', 'correct', 1),
    ])

    expect(evidence.map(({ skillId }) => skillId)).toEqual(['S1', 'S2'])
    expect(evidence.every(({ attemptId }) => attemptId === 'C2-01-attempt-1')).toBe(
      true,
    )
  })

  it('does not derive evidence from an incorrect attempt', () => {
    expect(
      deriveDaxLearningEvidence([attempt('C2-04', 'incorrect', 1)]),
    ).toEqual([])
  })

  it('does not grant mastery when a required skill is missing', () => {
    const evidence = deriveDaxLearningEvidence([
      attempt('C2-01', 'correct', 1),
      attempt('C2-02', 'correct', 2),
    ])

    expect(isDaxMissionMastered(evidence)).toBe(false)
  })

  it('keeps mastery false when all four skills are demonstrated before transfer', () => {
    const evidence = deriveDaxLearningEvidence([
      attempt('C2-01', 'correct', 1),
      attempt('C2-02', 'correct', 2),
      attempt('C2-03', 'correct', 3),
    ])

    expect(new Set(evidence.map(({ skillId }) => skillId))).toEqual(
      new Set(['S1', 'S2', 'S3', 'S4']),
    )
    expect(isDaxMissionMastered(evidence)).toBe(false)
  })

  it('grants mastery after all skills and the C2-04 transfer are demonstrated', () => {
    const evidence = deriveDaxLearningEvidence([
      attempt('C2-01', 'correct', 1),
      attempt('C2-02', 'correct', 2),
      attempt('C2-03', 'correct', 3),
      attempt('C2-04', 'correct', 4),
    ])

    expect(isDaxMissionMastered(evidence)).toBe(true)
  })
})

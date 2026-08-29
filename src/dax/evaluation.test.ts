import { describe, expect, it } from 'vitest'
import { evaluateDaxPrediction } from './evaluation'
import { calculateFilterContextExercise, daxExercises } from './exercise'

const expectedAnswers = [
  ['DAX-01', 450],
  ['DAX-02', 300],
  ['DAX-03', 300],
  ['DAX-04', 250],
  ['DAX-05', 250],
  ['DAX-06', 150],
  ['DAX-07', 50],
  ['DAX-08', 250],
  ['DAX-09', 500],
  ['DAX-10', 450],
  ['DAX-11', 200],
  ['DAX-12', 300],
] as const

describe('evaluateDaxPrediction', () => {
  it('returns correct for 450 on DAX-01', () => {
    expect(evaluateDaxPrediction(calculateFilterContextExercise, 450)).toEqual({
      result: 'correct',
    })
  })

  it('returns incorrect for 250 on DAX-01', () => {
    expect(evaluateDaxPrediction(calculateFilterContextExercise, 250)).toEqual({
      result: 'incorrect',
    })
  })

  it('does not accept another numeric value as correct', () => {
    expect(evaluateDaxPrediction(calculateFilterContextExercise, 449).result).toBe(
      'incorrect',
    )
  })

  it.each(expectedAnswers)(
    'evaluates the deterministic answer for %s as correct',
    (exerciseId, answer) => {
      const exercise = daxExercises.find(({ id }) => id === exerciseId)

      expect(exercise).toBeDefined()
      expect(evaluateDaxPrediction(exercise!, answer).result).toBe('correct')
    },
  )

  it('defines exactly the complete DAX-01 through DAX-12 sequence', () => {
    expect(daxExercises.map(({ id }) => id)).toEqual(
      expectedAnswers.map(([exerciseId]) => exerciseId),
    )
  })

  it('evaluates incorrect numeric answers as incorrect across the mission', () => {
    for (const exercise of daxExercises) {
      expect(evaluateDaxPrediction(exercise, -1).result).toBe('incorrect')
    }
  })
})

import { describe, expect, it } from 'vitest'
import { evaluateDaxPrediction } from './evaluation'
import { calculateFilterContextExercise, daxExercises } from './exercise'

describe('evaluateDaxPrediction', () => {
  it('returns correct for 450', () => {
    expect(evaluateDaxPrediction(calculateFilterContextExercise, 450)).toEqual({
      result: 'correct',
    })
  })

  it('returns incorrect for 250', () => {
    expect(evaluateDaxPrediction(calculateFilterContextExercise, 250)).toEqual({
      result: 'incorrect',
    })
  })

  it('does not accept another numeric value as correct', () => {
    expect(evaluateDaxPrediction(calculateFilterContextExercise, 449).result).toBe(
      'incorrect',
    )
  })

  it.each([
    ['C2-01', 450],
    ['C2-02', 300],
    ['C2-03', 300],
    ['C2-04', 300],
  ])('evaluates the expected answer for %s as correct', (exerciseId, answer) => {
    const exercise = daxExercises.find(({ id }) => id === exerciseId)

    expect(exercise).toBeDefined()
    expect(evaluateDaxPrediction(exercise!, answer).result).toBe('correct')
  })

  it('evaluates incorrect numeric answers as incorrect across the mission', () => {
    for (const exercise of daxExercises) {
      expect(evaluateDaxPrediction(exercise, -1).result).toBe('incorrect')
    }
  })
})

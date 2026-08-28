import { describe, expect, it } from 'vitest'
import { evaluateDaxPrediction } from './evaluation'
import { calculateFilterContextExercise } from './exercise'

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
})

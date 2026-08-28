import type { DaxEvaluation, DaxExercise } from './types'

export function evaluateDaxPrediction(
  exercise: DaxExercise,
  submittedAnswer: number,
): DaxEvaluation {
  return {
    result:
      submittedAnswer === exercise.expectedAnswer ? 'correct' : 'incorrect',
  }
}

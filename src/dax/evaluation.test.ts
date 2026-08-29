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

  it('defines an earned solved-context transformation for all 12 exercises', () => {
    for (const exercise of daxExercises) {
      expect(exercise.solvedContext.modificationEffect.length).toBeGreaterThan(0)
      expect(exercise.solvedContext.afterContext.length).toBeGreaterThan(0)
      expect(exercise.solvedContext.visibleRows.length).toBeGreaterThan(0)
    }
  })

  it('preserves the intended DAX-03 unrelated-filter transformation', () => {
    expect(daxExercises[2].solvedContext).toEqual({
      modificationEffect:
        'Removes the Region filter only; filters on other columns remain.',
      afterContext: ['Region filter removed', 'Channel = Online remains'],
      visibleRows: ['East / Online / 100', 'West / Online / 200'],
    })
  })

  it('represents KEEPFILTERS as intersection on DAX-08', () => {
    expect(daxExercises[7].solvedContext).toEqual({
      modificationEffect:
        'Intersects the supplied Region set with the existing East filter.',
      afterContext: [
        'Region = East (intersection of East with {East, West})',
      ],
      visibleRows: ['East / 100', 'East / 150'],
    })
  })

  it('represents ALL(Table) as removal of both active filters on DAX-09', () => {
    expect(daxExercises[8].solvedContext).toEqual({
      modificationEffect:
        'Removes filters from the entire Sales table, not one column.',
      afterContext: ['Region filter removed', 'Channel filter removed'],
      visibleRows: [
        'East / Online / 100',
        'East / Store / 150',
        'West / Online / 200',
        'West / Store / 50',
      ],
    })
  })

  it('represents relationship filter release correctly on DAX-10', () => {
    expect(daxExercises[9].solvedContext).toEqual({
      modificationEffect:
        'Removes the Customers Region filter that had propagated to Sales.',
      afterContext: [
        'Customers[Region] filter removed',
        'Customers → Sales no longer limits Sales by Region',
      ],
      visibleRows: ['C1 / 100', 'C2 / 150', 'C3 / 200'],
    })
  })
})

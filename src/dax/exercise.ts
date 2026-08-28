import type { DaxExercise } from './types'

export const calculateFilterContextExercise: DaxExercise = {
  id: 'C1-01',
  datasetName: 'Sales',
  salesRows: [
    { region: 'East', amount: 100 },
    { region: 'West', amount: 200 },
    { region: 'East', amount: 150 },
  ],
  filterContext: {
    column: 'Region',
    value: 'East',
  },
  measure: `CALCULATE(
    SUM(Sales[Amount]),
    ALL(Sales[Region])
)`,
  question:
    'What result will this measure return under the current filter context?',
  expectedAnswer: 450,
  reasoningSteps: [
    'The initial filter context restricts Region to East.',
    'CALCULATE evaluates its filter modification.',
    'ALL(Sales[Region]) removes the Region filter.',
    'The SUM therefore sees all three rows.',
  ],
}

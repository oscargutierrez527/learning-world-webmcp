import type { DaxDataColumn, DaxExercise } from './types'

const regionAmountColumns: DaxDataColumn[] = [
  { key: 'region', label: 'Region' },
  { key: 'amount', label: 'Amount' },
]

export const daxExercises: DaxExercise[] = [
  {
    id: 'C2-01',
    sequenceNumber: 1,
    stageLabel: 'Removing a column filter',
    datasetName: 'Sales',
    dataColumns: regionAmountColumns,
    dataRows: [
      { region: 'East', amount: 100 },
      { region: 'West', amount: 200 },
      { region: 'East', amount: 150 },
    ],
    filterContext: [{ column: 'Region', value: 'East' }],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    ALL(Sales[Region])
)`,
    question:
      'What result will this measure return under the current filter context?',
    expectedAnswer: 450,
    reasoningSteps: [
      'Region = East initially filters the table.',
      'CALCULATE applies its filter modification.',
      'ALL(Sales[Region]) removes the Region filter.',
      'All three rows become visible to SUM.',
      'Result = 450.',
    ],
    incorrectFeedback:
      'Re-check what ALL(Sales[Region]) does to the existing Region filter inside CALCULATE.',
    socraticBeforeAttempt:
      'Start with Region = East. When CALCULATE evaluates ALL(Sales[Region]), what happens to that existing filter before SUM runs?',
    socraticAfterIncorrect:
      'What happens to the existing Region filter when ALL(Sales[Region]) is evaluated inside CALCULATE?',
    conceptExplanation:
      'CALCULATE evaluates its expression in a modified filter context. ALL(Sales[Region]) removes the filter from Region; it does not add a new Region value.',
    skillIds: ['S1', 'S2'],
  },
  {
    id: 'C2-02',
    sequenceNumber: 2,
    stageLabel: 'Replacing a filter',
    datasetName: 'Sales',
    dataColumns: regionAmountColumns,
    dataRows: [
      { region: 'East', amount: 120 },
      { region: 'West', amount: 300 },
      { region: 'East', amount: 80 },
    ],
    filterContext: [{ column: 'Region', value: 'East' }],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    Sales[Region] = "West"
)`,
    question: 'What result will this measure return?',
    expectedAnswer: 300,
    reasoningSteps: [
      'The existing Region = East filter and the CALCULATE filter target the same column.',
      'CALCULATE replaces the existing Region filter with Region = West.',
      'Only the West row remains visible.',
      'Result = 300.',
    ],
    incorrectFeedback:
      'Focus on what CALCULATE does when its new filter targets the same Region column as the existing filter.',
    socraticBeforeAttempt:
      'The current context says East, while CALCULATE applies West to the same Region column. Which filter controls the expression?',
    socraticAfterIncorrect:
      'When CALCULATE applies a filter to the same Region column, does it combine with or replace the existing filter?',
    conceptExplanation:
      'A CALCULATE filter that targets an already-filtered column replaces the existing filter on that column unless KEEPFILTERS is used. Filters on other columns remain active.',
    skillIds: ['S3'],
  },
  {
    id: 'C2-03',
    sequenceNumber: 3,
    stageLabel: 'Preserving an unrelated filter',
    datasetName: 'Sales',
    dataColumns: [
      { key: 'region', label: 'Region' },
      { key: 'channel', label: 'Channel' },
      { key: 'amount', label: 'Amount' },
    ],
    dataRows: [
      { region: 'East', channel: 'Online', amount: 100 },
      { region: 'East', channel: 'Store', amount: 150 },
      { region: 'West', channel: 'Online', amount: 200 },
      { region: 'West', channel: 'Store', amount: 50 },
    ],
    filterContext: [
      { column: 'Region', value: 'East' },
      { column: 'Channel', value: 'Online' },
    ],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    ALL(Sales[Region])
)`,
    question: 'What result will this measure return?',
    expectedAnswer: 300,
    reasoningSteps: [
      'ALL(Sales[Region]) removes only the Region filter.',
      'The Channel = Online filter remains active.',
      'The visible rows are East / Online / 100 and West / Online / 200.',
      'Result = 300.',
    ],
    incorrectFeedback:
      'Identify which filter ALL removes, then check which unrelated filter remains active.',
    socraticBeforeAttempt:
      'ALL targets Region only. Which active filter is on a different column and therefore still limits the rows?',
    socraticAfterIncorrect:
      'Which filter does ALL(Sales[Region]) remove, and which Channel filter remains active?',
    conceptExplanation:
      'ALL(Sales[Region]) clears only the Region filter. Channel = Online remains in the filter context, so SUM still sees only rows allowed by Channel.',
    skillIds: ['S4'],
  },
  {
    id: 'C2-04',
    sequenceNumber: 4,
    stageLabel: 'Transfer exercise',
    datasetName: 'Orders',
    dataColumns: [
      { key: 'region', label: 'Region' },
      { key: 'segment', label: 'Segment' },
      { key: 'amount', label: 'Amount' },
    ],
    dataRows: [
      { region: 'North', segment: 'Retail', amount: 90 },
      { region: 'North', segment: 'Business', amount: 160 },
      { region: 'South', segment: 'Retail', amount: 210 },
      { region: 'South', segment: 'Business', amount: 140 },
    ],
    filterContext: [
      { column: 'Region', value: 'North' },
      { column: 'Segment', value: 'Retail' },
    ],
    measure: `CALCULATE(
    SUM(Orders[Amount]),
    ALL(Orders[Region])
)`,
    question: 'What result will this measure return?',
    expectedAnswer: 300,
    reasoningSteps: [
      'The Region filter is removed.',
      'The Segment = Retail filter remains.',
      'The visible rows are North / Retail / 90 and South / Retail / 210.',
      'Result = 300.',
    ],
    incorrectFeedback:
      'Track the Region filter separately from Segment: determine which one is removed and which one still limits Orders.',
    socraticBeforeAttempt:
      'In Orders, ALL targets Region. Which Segment filter still constrains the visible rows after Region is removed?',
    socraticAfterIncorrect:
      'Separate the filters by column: what happens to Region, and what continues to happen to Segment?',
    conceptExplanation:
      'The same rule transfers to Orders: ALL(Orders[Region]) removes Region while the unrelated Segment = Retail filter remains active.',
    skillIds: ['S1', 'S2', 'S4'],
  },
]

export const calculateFilterContextExercise = daxExercises[0]

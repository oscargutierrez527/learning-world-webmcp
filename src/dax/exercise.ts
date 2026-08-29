import type { DaxDataColumn, DaxDataRow, DaxExercise } from './types'

const regionAmountColumns: DaxDataColumn[] = [
  { key: 'region', label: 'Region' },
  { key: 'amount', label: 'Amount' },
]

const regionChannelAmountColumns: DaxDataColumn[] = [
  { key: 'region', label: 'Region' },
  { key: 'channel', label: 'Channel' },
  { key: 'amount', label: 'Amount' },
]

const marketChannelAmountColumns: DaxDataColumn[] = [
  { key: 'market', label: 'Market' },
  { key: 'channel', label: 'Channel' },
  { key: 'amount', label: 'Amount' },
]

const regionSegmentAmountColumns: DaxDataColumn[] = [
  { key: 'region', label: 'Region' },
  { key: 'segment', label: 'Segment' },
  { key: 'amount', label: 'Amount' },
]

const salesRegionAmountRows: DaxDataRow[] = [
  { region: 'East', amount: 100 },
  { region: 'West', amount: 200 },
  { region: 'East', amount: 150 },
]

const salesRegionChannelRows: DaxDataRow[] = [
  { region: 'East', channel: 'Online', amount: 100 },
  { region: 'East', channel: 'Store', amount: 150 },
  { region: 'West', channel: 'Online', amount: 200 },
  { region: 'West', channel: 'Store', amount: 50 },
]

export const daxExercises: DaxExercise[] = [
  {
    id: 'DAX-01',
    sequenceNumber: 1,
    stageLabel: 'Removing a column filter',
    datasetName: 'Sales',
    dataColumns: regionAmountColumns,
    dataRows: salesRegionAmountRows,
    filterContext: [{ column: 'Region', value: 'East' }],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    ALL(Sales[Region])
)`,
    filterOperation: 'ALL(Sales[Region])',
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
    id: 'DAX-02',
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
    filterOperation: 'Sales[Region] = "West"',
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
    skillIds: ['S1', 'S3'],
  },
  {
    id: 'DAX-03',
    sequenceNumber: 3,
    stageLabel: 'Preserving an unrelated filter',
    datasetName: 'Sales',
    dataColumns: regionChannelAmountColumns,
    dataRows: salesRegionChannelRows,
    filterContext: [
      { column: 'Region', value: 'East' },
      { column: 'Channel', value: 'Online' },
    ],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    ALL(Sales[Region])
)`,
    filterOperation: 'ALL(Sales[Region])',
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
    skillIds: ['S2', 'S4'],
  },
  {
    id: 'DAX-04',
    sequenceNumber: 4,
    stageLabel: 'Replacing one of two filters',
    datasetName: 'Sales',
    dataColumns: regionChannelAmountColumns,
    dataRows: [
      { region: 'East', channel: 'Online', amount: 120 },
      { region: 'East', channel: 'Store', amount: 80 },
      { region: 'West', channel: 'Online', amount: 250 },
      { region: 'West', channel: 'Store', amount: 150 },
    ],
    filterContext: [
      { column: 'Region', value: 'East' },
      { column: 'Channel', value: 'Online' },
    ],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    Sales[Region] = "West"
)`,
    filterOperation: 'Sales[Region] = "West"',
    question: 'What result will this measure return?',
    expectedAnswer: 250,
    reasoningSteps: [
      'CALCULATE replaces Region = East with Region = West.',
      'The unrelated Channel = Online filter remains active.',
      'Only the West / Online / 250 row remains visible.',
      'Result = 250.',
    ],
    incorrectFeedback:
      'Track the Region and Channel filters separately: one is replaced while the other remains.',
    socraticBeforeAttempt:
      'CALCULATE applies West to Region. What happens to the existing Channel = Online filter on a different column?',
    socraticAfterIncorrect:
      'After Region becomes West, which unchanged Channel filter still limits the visible rows?',
    conceptExplanation:
      'A new CALCULATE filter replaces the existing filter on the same column. It does not remove an unrelated filter such as Channel = Online.',
    skillIds: ['S3', 'S4'],
  },
  {
    id: 'DAX-05',
    sequenceNumber: 5,
    stageLabel: 'Removing a different column filter',
    datasetName: 'Transactions',
    dataColumns: marketChannelAmountColumns,
    dataRows: [
      { market: 'North', channel: 'Online', amount: 110 },
      { market: 'North', channel: 'Partner', amount: 140 },
      { market: 'South', channel: 'Online', amount: 220 },
      { market: 'South', channel: 'Partner', amount: 180 },
    ],
    filterContext: [
      { column: 'Market', value: 'North' },
      { column: 'Channel', value: 'Online' },
    ],
    measure: `CALCULATE(
    SUM(Transactions[Amount]),
    ALL(Transactions[Channel])
)`,
    filterOperation: 'ALL(Transactions[Channel])',
    question: 'What result will this measure return?',
    expectedAnswer: 250,
    reasoningSteps: [
      'ALL(Transactions[Channel]) removes the Channel filter.',
      'The Market = North filter remains active.',
      'The North / Online / 110 and North / Partner / 140 rows remain visible.',
      'Result = 250.',
    ],
    incorrectFeedback:
      'Focus on the column named inside ALL, then preserve the filter on the other column.',
    socraticBeforeAttempt:
      'If ALL removes Channel, which Market filter still decides which transaction rows are visible?',
    socraticAfterIncorrect:
      'Which Channel restriction disappears, and which Market restriction remains?',
    conceptExplanation:
      'ALL(Transactions[Channel]) removes only the Channel filter. The independent Market = North filter continues to constrain Transactions.',
    skillIds: ['S2', 'S4'],
  },
  {
    id: 'DAX-06',
    sequenceNumber: 6,
    stageLabel: 'Adding a new filter',
    datasetName: 'Sales',
    dataColumns: regionChannelAmountColumns,
    dataRows: salesRegionChannelRows,
    filterContext: [{ column: 'Region', value: 'East' }],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    Sales[Channel] = "Store"
)`,
    filterOperation: 'Sales[Channel] = "Store"',
    question: 'What result will this measure return?',
    expectedAnswer: 150,
    reasoningSteps: [
      'Region = East remains active.',
      'CALCULATE adds Channel = Store because Channel was not previously filtered.',
      'Only the East / Store / 150 row remains visible.',
      'Result = 150.',
    ],
    incorrectFeedback:
      'Keep the existing Region filter, then add the new Channel filter to the same context.',
    socraticBeforeAttempt:
      'There is no initial Channel filter. Which rows satisfy both the existing Region filter and the Channel filter added by CALCULATE?',
    socraticAfterIncorrect:
      'Did the new Channel = Store filter remove Region = East, or must both filters be true?',
    conceptExplanation:
      'When CALCULATE filters a previously unfiltered column, that filter is added to the context. Existing filters on other columns remain active.',
    skillIds: ['S4', 'S5'],
  },
  {
    id: 'DAX-07',
    sequenceNumber: 7,
    stageLabel: 'Combining filter arguments',
    datasetName: 'Sales',
    dataColumns: regionChannelAmountColumns,
    dataRows: salesRegionChannelRows,
    filterContext: [
      { column: 'Region', value: 'East' },
      { column: 'Channel', value: 'Online' },
    ],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    Sales[Region] = "West",
    Sales[Channel] = "Store"
)`,
    filterOperation:
      'Sales[Region] = "West"; Sales[Channel] = "Store"',
    question: 'What result will this measure return?',
    expectedAnswer: 50,
    reasoningSteps: [
      'The Region filter is replaced with Region = West.',
      'The Channel filter is replaced with Channel = Store.',
      'Both filter arguments participate in the modified context.',
      'Only the West / Store / 50 row remains visible.',
      'Result = 50.',
    ],
    incorrectFeedback:
      'Apply both CALCULATE filter arguments before deciding which rows remain visible.',
    socraticBeforeAttempt:
      'After both same-column replacements, which row satisfies Region = West and Channel = Store together?',
    socraticAfterIncorrect:
      'Have you applied both the Region replacement and the Channel replacement to the visible rows?',
    conceptExplanation:
      'CALCULATE evaluates all supplied filter arguments in the modified context. Here each argument replaces the existing filter on its corresponding column.',
    skillIds: ['S3', 'S5'],
  },
  {
    id: 'DAX-08',
    sequenceNumber: 8,
    stageLabel: 'Intersecting with KEEPFILTERS',
    datasetName: 'Sales',
    dataColumns: regionAmountColumns,
    dataRows: salesRegionAmountRows,
    filterContext: [{ column: 'Region', value: 'East' }],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    KEEPFILTERS(
        Sales[Region] IN { "East", "West" }
    )
)`,
    filterOperation:
      'KEEPFILTERS(Sales[Region] IN { "East", "West" })',
    question: 'What result will this measure return?',
    expectedAnswer: 250,
    reasoningSteps: [
      'The existing context filters Region to East.',
      'KEEPFILTERS intersects that filter with the set {East, West}.',
      'The intersection remains Region = East.',
      'The East rows contribute 100 and 150.',
      'Result = 250.',
    ],
    incorrectFeedback:
      'Compute the intersection between the existing Region filter and the Region values inside KEEPFILTERS.',
    socraticBeforeAttempt:
      'Which Region values survive the intersection of the existing East filter with the set {East, West}?',
    socraticAfterIncorrect:
      'KEEPFILTERS intersects rather than replaces. What is common to the existing filter and the supplied set?',
    conceptExplanation:
      'KEEPFILTERS changes the usual replacement behavior: the new filter is intersected with the existing filter on the same column.',
    skillIds: ['S6'],
  },
  {
    id: 'DAX-09',
    sequenceNumber: 9,
    stageLabel: 'Removing table filters',
    datasetName: 'Sales',
    dataColumns: regionChannelAmountColumns,
    dataRows: salesRegionChannelRows,
    filterContext: [
      { column: 'Region', value: 'East' },
      { column: 'Channel', value: 'Online' },
    ],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    ALL(Sales)
)`,
    filterOperation: 'ALL(Sales)',
    question: 'What result will this measure return?',
    expectedAnswer: 500,
    reasoningSteps: [
      'ALL(Sales) removes filters from the Sales table.',
      'Both the Region and Channel filters are cleared.',
      'All four Sales rows become visible.',
      'Result = 500.',
    ],
    incorrectFeedback:
      'Compare the scope of ALL(Sales) with ALL(Sales[Region]); determine how many Sales columns lose filters.',
    socraticBeforeAttempt:
      'Because ALL targets the Sales table rather than one column, which active Sales filters are removed?',
    socraticAfterIncorrect:
      'Did you clear only Region, or every active filter that belongs to the Sales table?',
    conceptExplanation:
      'ALL(Sales) has table scope, so it removes filters from every column of Sales. This differs from ALL applied to one named column.',
    skillIds: ['S7'],
  },
  {
    id: 'DAX-10',
    sequenceNumber: 10,
    stageLabel: 'Tracing relationship filters',
    datasetName: 'Customers',
    dataColumns: [
      { key: 'customerId', label: 'CustomerID' },
      { key: 'region', label: 'Region' },
    ],
    dataRows: [
      { customerId: 'C1', region: 'East' },
      { customerId: 'C2', region: 'East' },
      { customerId: 'C3', region: 'West' },
    ],
    relatedDatasets: [
      {
        name: 'Sales',
        columns: [
          { key: 'customerId', label: 'CustomerID' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: [
          { customerId: 'C1', amount: 100 },
          { customerId: 'C2', amount: 150 },
          { customerId: 'C3', amount: 200 },
        ],
      },
    ],
    relationship: {
      fromTable: 'Customers',
      fromColumn: 'CustomerID',
      fromCardinality: 'one',
      toTable: 'Sales',
      toColumn: 'CustomerID',
      toCardinality: 'many',
      filterDirection: 'Customers → Sales',
    },
    filterContext: [{ column: 'Customers[Region]', value: 'East' }],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    ALL(Customers[Region])
)`,
    filterOperation: 'ALL(Customers[Region])',
    question: 'What result will this measure return?',
    expectedAnswer: 450,
    reasoningSteps: [
      'Customers[Region] = East initially filters Customers.',
      'That Customers filter propagates through the relationship to Sales.',
      'ALL(Customers[Region]) removes the dimension filter.',
      'All three customers can then contribute to Sales.',
      'Result = 450.',
    ],
    incorrectFeedback:
      'Trace the Customers Region filter through the one-to-many relationship, then remove that dimension filter.',
    socraticBeforeAttempt:
      'How does Customers[Region] limit Sales through the relationship, and what changes when that Region filter is removed?',
    socraticAfterIncorrect:
      'After ALL removes Customers[Region], which customer keys can propagate to Sales?',
    conceptExplanation:
      'A filter on Customers propagates to Sales through the single-direction relationship. Removing Customers[Region] removes the dimension restriction that had limited related Sales rows.',
    skillIds: ['S8'],
  },
  {
    id: 'DAX-11',
    sequenceNumber: 11,
    stageLabel: 'Composing filter changes',
    datasetName: 'Sales',
    dataColumns: regionChannelAmountColumns,
    dataRows: salesRegionChannelRows,
    filterContext: [
      { column: 'Region', value: 'East' },
      { column: 'Channel', value: 'Online' },
    ],
    measure: `CALCULATE(
    SUM(Sales[Amount]),
    ALL(Sales[Region]),
    Sales[Channel] = "Store"
)`,
    filterOperation:
      'ALL(Sales[Region]); Sales[Channel] = "Store"',
    question: 'What result will this measure return?',
    expectedAnswer: 200,
    reasoningSteps: [
      'ALL(Sales[Region]) removes the Region filter.',
      'Channel = Online is replaced by Channel = Store.',
      'The visible rows are East / Store / 150 and West / Store / 50.',
      'Result = 200.',
    ],
    incorrectFeedback:
      'Apply each filter argument by column: remove Region, then replace the existing Channel filter.',
    socraticBeforeAttempt:
      'After Region is cleared and Channel becomes Store, which rows satisfy the complete modified context?',
    socraticAfterIncorrect:
      'Did you both remove Region and replace Online with Store before selecting visible rows?',
    conceptExplanation:
      'CALCULATE composes its filter changes: ALL clears Region, while the Channel argument replaces the existing Channel filter with Store.',
    skillIds: ['S2', 'S4', 'S5'],
  },
  {
    id: 'DAX-12',
    sequenceNumber: 12,
    stageLabel: 'Transfer exercise',
    datasetName: 'Orders',
    dataColumns: regionSegmentAmountColumns,
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
    filterOperation: 'ALL(Orders[Region])',
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

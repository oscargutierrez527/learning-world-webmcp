import type {
  DaxAttemptResult,
  DaxExercise,
  DaxMisconceptionId,
  DaxPossibleMisconception,
} from './types'

interface DaxMisconceptionDefinition extends DaxPossibleMisconception {
  socraticPrompt: string
  explanation: string
  traceFocus: string
}

export const daxMisconceptions: Record<
  DaxMisconceptionId,
  DaxMisconceptionDefinition
> = {
  M02: {
    id: 'M02',
    label: 'Assumes ALL(column) removes every active filter',
    socraticPrompt:
      'ALL targets one specific column here. Which other active filters were not targeted?',
    explanation:
      'ALL(column) removes the filter from the named column. It does not automatically remove active filters on other columns.',
    traceFocus:
      'Separate the targeted column from every unrelated active filter.',
  },
  M03: {
    id: 'M03',
    label: 'Assumes the targeted filter remains unchanged',
    socraticPrompt:
      'What should happen to the filter targeted by this CALCULATE filter modification?',
    explanation:
      'The targeted CALCULATE filter modification changes the named filter before the expression is evaluated; that filter does not remain unchanged.',
    traceFocus:
      'Apply the targeted filter modification before rebuilding the context.',
  },
  M04: {
    id: 'M04',
    label: 'Treats same-column CALCULATE filtering as intersection',
    socraticPrompt:
      'When CALCULATE applies a new filter to the same column, does it intersect by default or replace the existing filter?',
    explanation:
      'Without KEEPFILTERS, a CALCULATE filter on an already-filtered column replaces the existing filter on that column rather than intersecting with it.',
    traceFocus:
      'Distinguish default same-column replacement from intersection behavior.',
  },
  M05: {
    id: 'M05',
    label: 'Drops unrelated filters during filter modification',
    socraticPrompt:
      'Which active filters belong to columns that this CALCULATE argument does not modify?',
    explanation:
      'A filter modification on one column does not clear active filters on unrelated columns. Those unrelated filters continue to constrain the context.',
    traceFocus:
      'Carry every unrelated active filter into the rebuilt context.',
  },
  M06: {
    id: 'M06',
    label: 'Ignores a new CALCULATE filter',
    socraticPrompt:
      'Which new filter does CALCULATE apply before the measure is evaluated?',
    explanation:
      'CALCULATE applies its new filter before evaluating the expression. The resulting context must include that added or replacement filter.',
    traceFocus:
      'Add or replace the filter introduced by CALCULATE before evaluating SUM.',
  },
  M07: {
    id: 'M07',
    label: 'Applies only one of multiple CALCULATE filters',
    socraticPrompt:
      'How many filter arguments are inside CALCULATE, and what context results when all of them are applied?',
    explanation:
      'Every filter argument inside CALCULATE participates in the modified context. Apply all of them before evaluating the expression.',
    traceFocus:
      'Account for every CALCULATE filter argument in the rebuilt context.',
  },
  M08: {
    id: 'M08',
    label: 'Treats KEEPFILTERS like normal replacement',
    socraticPrompt:
      'What does KEEPFILTERS change about CALCULATE’s usual behavior on an already-filtered column?',
    explanation:
      'KEEPFILTERS preserves intersection behavior: the supplied filter is intersected with the existing filter instead of replacing it.',
    traceFocus:
      'Intersect the existing same-column filter with the KEEPFILTERS condition.',
  },
  M09: {
    id: 'M09',
    label: 'Treats ALL(Table) like ALL(Column)',
    socraticPrompt:
      'Is ALL receiving a single column here, or the entire table?',
    explanation:
      'ALL(Table) removes filters across the named table. Its scope is broader than ALL(Column), which removes only one column filter.',
    traceFocus:
      'Use the table argument to determine the full scope of filter removal.',
  },
  M10: {
    id: 'M10',
    label: 'Misses relationship filter propagation',
    socraticPrompt:
      'Where does the Region filter originate, and how does the Customers → Sales relationship propagate that filter?',
    explanation:
      'The Customers filter propagates to Sales through the displayed single-direction relationship. Removing the dimension filter changes which related Sales rows can participate.',
    traceFocus:
      'Trace the dimension filter through Customers → Sales before and after modification.',
  },
}

const knownDaxDistractors: Record<
  string,
  Partial<Record<number, DaxMisconceptionId>>
> = {
  'DAX-01': { 250: 'M03' },
  'DAX-02': { 0: 'M04', 200: 'M06' },
  'DAX-03': { 500: 'M02', 100: 'M03' },
  'DAX-04': { 0: 'M04', 400: 'M05', 120: 'M06' },
  'DAX-05': { 650: 'M02', 110: 'M03' },
  'DAX-06': { 250: 'M06' },
  'DAX-07': { 250: 'M07', 150: 'M07' },
  'DAX-08': { 450: 'M08' },
  'DAX-09': { 300: 'M09' },
  'DAX-10': { 250: 'M10' },
  'DAX-11': { 150: 'M03', 300: 'M06' },
  'DAX-12': { 600: 'M02', 90: 'M03' },
}

export function identifyDaxMisconception(
  exercise: DaxExercise,
  submittedAnswer: number,
  evaluationResult: DaxAttemptResult,
): DaxPossibleMisconception | null {
  if (evaluationResult === 'correct') {
    return null
  }

  const misconceptionId = knownDaxDistractors[exercise.id]?.[submittedAnswer]
  if (!misconceptionId) {
    return null
  }

  const { id, label } = daxMisconceptions[misconceptionId]
  return { id, label }
}

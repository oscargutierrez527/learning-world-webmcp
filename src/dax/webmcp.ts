import { daxExercises } from './exercise'
import {
  deriveDaxLearningEvidence,
  getDemonstratedDaxSkillIds,
  isDaxMissionMastered,
  requiredDaxSkills,
} from './learning'
import {
  daxMisconceptions,
  identifyDaxMisconception,
} from './misconceptions'
import type {
  DaxAgentSupport,
  DaxAttempt,
  DaxFilterTrace,
  DaxPossibleMisconception,
  DaxTextSupport,
} from './types'

export interface DaxWebMcpSnapshot {
  currentExerciseIndex: number
  attempts: DaxAttempt[]
}

const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

function getCurrentExercise(snapshot: DaxWebMcpSnapshot) {
  return daxExercises[snapshot.currentExerciseIndex] ?? daxExercises[0]
}

function getCurrentExerciseResult(snapshot: DaxWebMcpSnapshot) {
  const exercise = getCurrentExercise(snapshot)
  const solved = snapshot.attempts.some(
    ({ exerciseId, result }) =>
      exerciseId === exercise.id && result === 'correct',
  )

  return {
    exerciseId: exercise.id,
    exerciseNumber: exercise.sequenceNumber,
    totalExercises: daxExercises.length,
    question: exercise.question,
    measure: exercise.measure,
    solved,
  }
}

function inspectFilterContextResult(snapshot: DaxWebMcpSnapshot) {
  const exercise = getCurrentExercise(snapshot)
  const relatedDatasets = exercise.relatedDatasets?.map((dataset) => ({
    name: dataset.name,
    columns: dataset.columns.map(({ key, label }) => ({ key, label })),
    rows: dataset.rows.map((row) =>
      Object.fromEntries(dataset.columns.map(({ key }) => [key, row[key]])),
    ),
  }))

  return {
    exerciseId: exercise.id,
    dataset: {
      name: exercise.datasetName,
      columns: exercise.dataColumns.map(({ key, label }) => ({ key, label })),
      rows: exercise.dataRows.map((row) =>
        Object.fromEntries(
          exercise.dataColumns.map(({ key }) => [key, row[key]]),
        ),
      ),
    },
    activeFilterContext: exercise.filterContext.map(({ column, value }) => ({
      column,
      value,
    })),
    ...(relatedDatasets ? { relatedDatasets } : {}),
    ...(exercise.relationship
      ? { relationship: { ...exercise.relationship } }
      : {}),
    measure: exercise.measure,
  }
}

function getAttemptPossibleMisconception(
  attempt: DaxAttempt,
): DaxPossibleMisconception | null {
  const exercise = daxExercises.find(({ id }) => id === attempt.exerciseId)
  if (!exercise) {
    return null
  }

  return identifyDaxMisconception(
    exercise,
    attempt.submittedAnswer,
    attempt.result,
  )
}

function getAttemptHistoryResult(snapshot: DaxWebMcpSnapshot) {
  const attempts = snapshot.attempts.map((attempt) => {
    const { sequenceNumber, exerciseId, submittedAnswer, result } = attempt
    return {
      sequenceNumber,
      exerciseId,
      submittedAnswer,
      evaluation: result,
      possibleMisconception: getAttemptPossibleMisconception(attempt),
    }
  })

  return {
    empty: attempts.length === 0,
    attempts,
  }
}

function getLearningProgressResult(snapshot: DaxWebMcpSnapshot) {
  const evidence = deriveDaxLearningEvidence(snapshot.attempts)
  const demonstratedSkillIds = getDemonstratedDaxSkillIds(evidence)
  const solvedExerciseIds = new Set(
    snapshot.attempts
      .filter(({ result }) => result === 'correct')
      .map(({ exerciseId }) => exerciseId),
  )
  const transferDemonstrated = evidence.some(
    ({ exerciseId }) => exerciseId === 'DAX-12',
  )
  const mastery = isDaxMissionMastered(evidence)

  return {
    exercises: {
      solved: solvedExerciseIds.size,
      total: daxExercises.length,
    },
    currentExercise: {
      exerciseId: getCurrentExercise(snapshot).id,
      exerciseNumber: snapshot.currentExerciseIndex + 1,
      totalExercises: daxExercises.length,
    },
    skills: requiredDaxSkills.map(({ id, name }) => ({
      id,
      name,
      status: demonstratedSkillIds.has(id) ? 'demonstrated' : 'remaining',
    })),
    demonstratedSkillIds: requiredDaxSkills
      .filter(({ id }) => demonstratedSkillIds.has(id))
      .map(({ id }) => id),
    remainingSkillIds: requiredDaxSkills
      .filter(({ id }) => !demonstratedSkillIds.has(id))
      .map(({ id }) => id),
    transferRequirement: {
      exerciseId: 'DAX-12',
      status: transferDemonstrated ? 'demonstrated' : 'pending',
    },
    mastery,
    missionComplete: mastery && solvedExerciseIds.size === daxExercises.length,
  }
}

function getLatestCurrentAttempt(snapshot: DaxWebMcpSnapshot) {
  const exercise = getCurrentExercise(snapshot)
  return snapshot.attempts
    .filter(({ exerciseId }) => exerciseId === exercise.id)
    .at(-1)
}

function getCurrentLearnerState(snapshot: DaxWebMcpSnapshot) {
  const latestAttempt = getLatestCurrentAttempt(snapshot)

  if (latestAttempt?.result === 'correct') {
    return 'solved' as const
  }

  if (latestAttempt?.result === 'incorrect') {
    return 'incorrect' as const
  }

  return 'not_attempted' as const
}

function getCurrentPossibleMisconception(
  snapshot: DaxWebMcpSnapshot,
): DaxPossibleMisconception | null {
  const latestAttempt = getLatestCurrentAttempt(snapshot)
  return latestAttempt ? getAttemptPossibleMisconception(latestAttempt) : null
}

function getSocraticSupport(snapshot: DaxWebMcpSnapshot): DaxTextSupport {
  const exercise = getCurrentExercise(snapshot)
  const learnerState = getCurrentLearnerState(snapshot)
  const possibleMisconception = getCurrentPossibleMisconception(snapshot)

  return {
    type: 'socratic',
    exerciseId: exercise.id,
    learnerState,
    possibleMisconception,
    text:
      possibleMisconception
        ? daxMisconceptions[possibleMisconception.id].socraticPrompt
        : learnerState === 'incorrect'
        ? exercise.socraticAfterIncorrect
        : exercise.socraticBeforeAttempt,
  }
}

function getExplanationSupport(snapshot: DaxWebMcpSnapshot): DaxTextSupport {
  const exercise = getCurrentExercise(snapshot)
  const learnerState = getCurrentLearnerState(snapshot)
  const possibleMisconception = getCurrentPossibleMisconception(snapshot)

  return {
    type: 'explanation',
    exerciseId: exercise.id,
    learnerState,
    possibleMisconception,
    text:
      learnerState === 'solved'
        ? [exercise.conceptExplanation, ...exercise.reasoningSteps].join(' ')
        : possibleMisconception
          ? daxMisconceptions[possibleMisconception.id].explanation
        : exercise.conceptExplanation,
  }
}

function getFilterTraceSupport(snapshot: DaxWebMcpSnapshot): DaxFilterTrace {
  const exercise = getCurrentExercise(snapshot)
  const learnerState = getCurrentLearnerState(snapshot)
  const possibleMisconception = getCurrentPossibleMisconception(snapshot)
  const focus = [
    'Identify which existing filter each CALCULATE operation targets.',
    'Identify active filters on unrelated columns.',
    'Rebuild the filter context before evaluating SUM.',
  ]

  if (possibleMisconception) {
    focus.unshift(daxMisconceptions[possibleMisconception.id].traceFocus)
  }

  return {
    type: 'filter_trace',
    mode: 'filter_trace',
    exerciseId: exercise.id,
    learnerState,
    beforeFilters: exercise.filterContext.map(
      ({ column, value }) => `${column} = ${value}`,
    ),
    operation: exercise.filterOperation,
    focus,
    possibleMisconception,
    complete: learnerState === 'solved',
    ...(learnerState === 'solved'
      ? {
          establishedReasoning: [...exercise.reasoningSteps],
          result: exercise.expectedAnswer,
        }
      : {}),
  }
}

export function createDaxWebMcpTools(
  getSnapshot: () => DaxWebMcpSnapshot,
  showSupport: (support: DaxAgentSupport) => void = () => undefined,
): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'get_current_exercise',
      title: 'Get current DAX exercise',
      description:
        'Use to identify the DAX exercise the learner is currently solving and whether it is solved.',
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true },
      execute: () => getCurrentExerciseResult(getSnapshot()),
    },
    {
      name: 'inspect_filter_context',
      title: 'Inspect DAX filter context',
      description:
        'Use to inspect the current visible dataset, active filters, and DAX measure for filter-context reasoning.',
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true },
      execute: () => inspectFilterContextResult(getSnapshot()),
    },
    {
      name: 'get_attempt_history',
      title: 'Get DAX attempt history',
      description:
        'Use to observe the learner’s actual evaluated numeric attempts across DAX exercises.',
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true },
      execute: () => getAttemptHistoryResult(getSnapshot()),
    },
    {
      name: 'get_learning_progress',
      title: 'Get DAX learning progress',
      description:
        'Use to observe exercise progress, demonstrated DAX skills, transfer status, and derived mastery.',
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true },
      execute: () => getLearningProgressResult(getSnapshot()),
    },
    {
      name: 'request_socratic_intervention',
      title: 'Request Socratic DAX support',
      description:
        'Use to show a bounded Socratic question for the learner’s current DAX exercise and attempt state.',
      inputSchema: emptyInputSchema,
      execute: () => {
        const support = getSocraticSupport(getSnapshot())
        showSupport(support)
        return support
      },
    },
    {
      name: 'request_explanation',
      title: 'Request DAX concept explanation',
      description:
        'Use to show a bounded explanation for the learner’s current DAX filter-context concept.',
      inputSchema: emptyInputSchema,
      execute: () => {
        const support = getExplanationSupport(getSnapshot())
        showSupport(support)
        return support
      },
    },
    {
      name: 'request_filter_trace',
      title: 'Request DAX filter trace',
      description:
        'Use to show a structured filter-context reasoning scaffold for the learner’s current DAX exercise and attempt state.',
      inputSchema: emptyInputSchema,
      execute: () => {
        const support = getFilterTraceSupport(getSnapshot())
        showSupport(support)
        return support
      },
    },
  ]
}

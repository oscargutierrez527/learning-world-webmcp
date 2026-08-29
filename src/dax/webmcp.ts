import { daxExercises } from './exercise'
import {
  deriveDaxLearningEvidence,
  getDemonstratedDaxSkillIds,
  isDaxMissionMastered,
  requiredDaxSkills,
} from './learning'
import type { DaxAgentSupport, DaxAttempt } from './types'

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
    measure: exercise.measure,
  }
}

function getAttemptHistoryResult(snapshot: DaxWebMcpSnapshot) {
  const attempts = snapshot.attempts.map(
    ({ sequenceNumber, exerciseId, submittedAnswer, result }) => ({
      sequenceNumber,
      exerciseId,
      submittedAnswer,
      evaluation: result,
    }),
  )

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
    ({ exerciseId }) => exerciseId === 'C2-04',
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
      exerciseId: 'C2-04',
      status: transferDemonstrated ? 'demonstrated' : 'pending',
    },
    mastery,
    missionComplete: mastery && solvedExerciseIds.size === daxExercises.length,
  }
}

function getCurrentLearnerState(snapshot: DaxWebMcpSnapshot) {
  const exercise = getCurrentExercise(snapshot)
  const latestAttempt = snapshot.attempts
    .filter(({ exerciseId }) => exerciseId === exercise.id)
    .at(-1)

  if (latestAttempt?.result === 'correct') {
    return 'solved' as const
  }

  if (latestAttempt?.result === 'incorrect') {
    return 'incorrect' as const
  }

  return 'not_attempted' as const
}

function getSocraticSupport(snapshot: DaxWebMcpSnapshot): DaxAgentSupport {
  const exercise = getCurrentExercise(snapshot)
  const learnerState = getCurrentLearnerState(snapshot)

  return {
    type: 'socratic',
    exerciseId: exercise.id,
    learnerState,
    text:
      learnerState === 'incorrect'
        ? exercise.socraticAfterIncorrect
        : exercise.socraticBeforeAttempt,
  }
}

function getExplanationSupport(snapshot: DaxWebMcpSnapshot): DaxAgentSupport {
  const exercise = getCurrentExercise(snapshot)
  const learnerState = getCurrentLearnerState(snapshot)

  return {
    type: 'explanation',
    exerciseId: exercise.id,
    learnerState,
    text:
      learnerState === 'solved'
        ? [exercise.conceptExplanation, ...exercise.reasoningSteps].join(' ')
        : exercise.conceptExplanation,
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
  ]
}

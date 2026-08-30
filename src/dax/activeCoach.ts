import {
  DAX_COACH_MISSION_ID,
  parseDaxCoachSelection,
  type DaxCoachAttemptSnapshot,
  type DaxCoachIntervention,
  type DaxCoachSelection,
  type DaxCoachSnapshot,
} from './activeCoachContract'
import { identifyDaxMisconception } from './misconceptions'
import type {
  DaxAttempt,
  DaxExercise,
  DaxSkillId,
} from './types'

export const DAX_ACTIVE_COACH_ENDPOINT = '/api/active-coach'
export const DAX_ACTIVE_COACH_TIMEOUT_MS = 8_000

export type DaxCoachInteractionStatus =
  | 'selecting'
  | 'invoking'
  | 'delivered'
  | 'coach_unavailable'
  | 'webmcp_unavailable'

export interface DaxCoachInteraction {
  attemptId: string
  attemptSequenceNumber: number
  status: DaxCoachInteractionStatus
  selectedIntervention: DaxCoachIntervention | null
}

export class DaxCoachPipelineError extends Error {
  readonly code:
      | 'coach_unavailable'
      | 'invalid_selection'
      | 'invalid_tool_result'

  constructor(code: DaxCoachPipelineError['code']) {
    super(code)
    this.name = 'DaxCoachPipelineError'
    this.code = code
  }
}

interface DaxExecutableModelContext {
  getTools(): Promise<WebMCP.RegisteredTool[]>
  executeTool(
    tool: WebMCP.RegisteredTool,
    inputObject?: object,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>
}

const toolNames: Record<DaxCoachIntervention, string> = {
  socratic: 'request_socratic_intervention',
  explanation: 'request_explanation',
  filter_trace: 'request_filter_trace',
}

function getRelationshipSummary(exercise: DaxExercise) {
  const relationship = exercise.relationship
  if (!relationship) {
    return null
  }

  return `${relationship.fromTable}[${relationship.fromColumn}] 1 → * ${relationship.toTable}[${relationship.toColumn}]; ${relationship.filterDirection}`
}

function toAttemptSnapshot(
  exercise: DaxExercise,
  attempt: DaxAttempt,
): DaxCoachAttemptSnapshot {
  return {
    attemptId: attempt.id,
    sequenceNumber: attempt.sequenceNumber,
    submittedAnswer: attempt.submittedAnswer,
    evaluation: 'incorrect',
    possibleMisconception: identifyDaxMisconception(
      exercise,
      attempt.submittedAnswer,
      attempt.result,
    ),
  }
}

export function buildDaxCoachSnapshot({
  exercise,
  currentAttempt,
  attempts,
  demonstratedSkillIds,
  priorInterventions,
}: {
  exercise: DaxExercise
  currentAttempt: DaxAttempt
  attempts: DaxAttempt[]
  demonstratedSkillIds: Iterable<DaxSkillId>
  priorInterventions: DaxCoachIntervention[]
}): DaxCoachSnapshot {
  const recentAttempts = attempts
    .filter(
      (attempt) =>
        attempt.exerciseId === exercise.id && attempt.result === 'incorrect',
    )
    .slice(-4)
    .map((attempt) => toAttemptSnapshot(exercise, attempt))
  const currentAttemptSnapshot = toAttemptSnapshot(exercise, currentAttempt)

  return {
    missionId: DAX_COACH_MISSION_ID,
    exercise: {
      id: exercise.id,
      concept: exercise.stageLabel,
      activeFilterContext: exercise.filterContext.map(({ column, value }) => ({
        column,
        value,
      })),
      daxExpression: exercise.measure,
      filterOperation: exercise.filterOperation,
      relationshipSummary: getRelationshipSummary(exercise),
    },
    currentAttempt: currentAttemptSnapshot,
    recentAttempts,
    possibleMisconception: currentAttemptSnapshot.possibleMisconception,
    demonstratedSkillIds: [...demonstratedSkillIds],
    priorInterventions: priorInterventions.slice(-4),
  }
}

export async function requestDaxCoachSelection(
  snapshot: DaxCoachSnapshot,
  signal: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
): Promise<DaxCoachSelection> {
  let response: Response
  try {
    response = await fetchImplementation(DAX_ACTIVE_COACH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
      signal,
    })
  } catch (error) {
    if (signal.aborted) {
      throw error
    }
    throw new DaxCoachPipelineError('coach_unavailable')
  }

  if (!response.ok) {
    throw new DaxCoachPipelineError('coach_unavailable')
  }

  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw new DaxCoachPipelineError('invalid_selection')
  }

  const selection = parseDaxCoachSelection(result)
  if (!selection) {
    throw new DaxCoachPipelineError('invalid_selection')
  }

  return selection
}

function isExpectedToolResult(
  value: unknown,
  intervention: DaxCoachIntervention,
  exerciseId: string,
) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const result = value as Record<string, unknown>
  return result.type === intervention && result.exerciseId === exerciseId
}

export async function executeDaxCoachWebMcp(
  intervention: DaxCoachIntervention,
  exerciseId: string,
  signal: AbortSignal,
): Promise<'executed' | 'unavailable'> {
  const modelContext = document.modelContext as
    | DaxExecutableModelContext
    | undefined
  if (
    !modelContext ||
    typeof modelContext.getTools !== 'function' ||
    typeof modelContext.executeTool !== 'function'
  ) {
    return 'unavailable'
  }

  const toolName = toolNames[intervention]
  const tools = await modelContext.getTools()
  const selectedTool = tools.find(
    (tool) =>
      tool.name === toolName && tool.origin === window.location.origin,
  )
  if (!selectedTool) {
    return 'unavailable'
  }

  const serializedResult = await modelContext.executeTool(
    selectedTool,
    {},
    { signal },
  )
  let result = serializedResult
  if (typeof serializedResult === 'string') {
    try {
      result = JSON.parse(serializedResult)
    } catch {
      throw new DaxCoachPipelineError('invalid_tool_result')
    }
  }

  if (!isExpectedToolResult(result, intervention, exerciseId)) {
    throw new DaxCoachPipelineError('invalid_tool_result')
  }

  return 'executed'
}

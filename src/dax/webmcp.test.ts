import { describe, expect, it } from 'vitest'
import type { DaxAttempt } from './types'
import {
  createDaxWebMcpTools,
  type DaxWebMcpSnapshot,
} from './webmcp'

const executeOptions: WebMCP.ToolExecuteCallbackOptions = {
  signal: new AbortController().signal,
}

function attempt(
  exerciseId: string,
  submittedAnswer: number,
  result: DaxAttempt['result'],
  sequenceNumber: number,
): DaxAttempt {
  return {
    id: `${exerciseId}-attempt-${sequenceNumber}`,
    exerciseId,
    submittedAnswer,
    result,
    sequenceNumber,
  }
}

async function executeTool(
  name: string,
  snapshot: DaxWebMcpSnapshot,
): Promise<Record<string, unknown>> {
  const tool = createDaxWebMcpTools(() => snapshot).find(
    (candidate) => candidate.name === name,
  )

  expect(tool).toBeDefined()
  return (await tool!.execute({}, executeOptions)) as Record<string, unknown>
}

describe('DAX WebMCP tool contracts', () => {
  it('exposes exactly the four intended observation tools', () => {
    const tools = createDaxWebMcpTools(() => ({
      currentExerciseIndex: 0,
      attempts: [],
    }))

    expect(tools.map(({ name }) => name)).toEqual([
      'get_current_exercise',
      'inspect_filter_context',
      'get_attempt_history',
      'get_learning_progress',
    ])
  })

  it('marks every tool read-only and gives it a closed empty input schema', () => {
    const tools = createDaxWebMcpTools(() => ({
      currentExerciseIndex: 0,
      attempts: [],
    }))

    for (const tool of tools) {
      expect(tool.annotations).toEqual({ readOnlyHint: true })
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false,
      })
    }
  })

  it('does not expose mutation tools or mutate the supplied learning snapshot', async () => {
    const snapshot: DaxWebMcpSnapshot = {
      currentExerciseIndex: 0,
      attempts: [attempt('C2-01', 250, 'incorrect', 1)],
    }
    const beforeExecution = structuredClone(snapshot)
    const tools = createDaxWebMcpTools(() => snapshot)

    await Promise.all(tools.map((tool) => tool.execute({}, executeOptions)))

    expect(snapshot).toEqual(beforeExecution)
    expect(tools.map(({ name }) => name).join(' ')).not.toMatch(
      /submit|create|set_|mark|complete|advance|fabricate/,
    )
  })

  it('does not leak the current exercise answer or hidden reasoning', async () => {
    const result = await executeTool('get_current_exercise', {
      currentExerciseIndex: 0,
      attempts: [],
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      exerciseId: 'C2-01',
      exerciseNumber: 1,
      totalExercises: 4,
      solved: false,
    })
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('reasoningSteps')
    expect(serialized).not.toContain('450')
  })

  it('exposes visible filter context without leaking the answer key', async () => {
    const result = await executeTool('inspect_filter_context', {
      currentExerciseIndex: 0,
      attempts: [],
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      exerciseId: 'C2-01',
      dataset: { name: 'Sales' },
      activeFilterContext: [{ column: 'Region', value: 'East' }],
    })
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('reasoningSteps')
    expect(serialized).not.toContain('450')
  })

  it('returns a clear empty attempt history before the learner submits', async () => {
    await expect(
      executeTool('get_attempt_history', {
        currentExerciseIndex: 0,
        attempts: [],
      }),
    ).resolves.toEqual({ empty: true, attempts: [] })
  })

  it('returns the actual attempt state supplied by the learner flow', async () => {
    const result = await executeTool('get_attempt_history', {
      currentExerciseIndex: 0,
      attempts: [attempt('C2-01', 250, 'incorrect', 1)],
    })

    expect(result).toEqual({
      empty: false,
      attempts: [
        {
          sequenceNumber: 1,
          exerciseId: 'C2-01',
          submittedAnswer: 250,
          evaluation: 'incorrect',
        },
      ],
    })
  })

  it('reports all skills demonstrated but transfer pending before C2-04', async () => {
    const result = await executeTool('get_learning_progress', {
      currentExerciseIndex: 2,
      attempts: [
        attempt('C2-01', 450, 'correct', 1),
        attempt('C2-02', 300, 'correct', 2),
        attempt('C2-03', 300, 'correct', 3),
      ],
    })

    expect(result).toMatchObject({
      exercises: { solved: 3, total: 4 },
      demonstratedSkillIds: ['S1', 'S2', 'S3', 'S4'],
      remainingSkillIds: [],
      transferRequirement: {
        exerciseId: 'C2-04',
        status: 'pending',
      },
      mastery: false,
      missionComplete: false,
    })
  })

  it('reports mastery only after successful C2-04 transfer evidence', async () => {
    const result = await executeTool('get_learning_progress', {
      currentExerciseIndex: 3,
      attempts: [
        attempt('C2-01', 450, 'correct', 1),
        attempt('C2-02', 300, 'correct', 2),
        attempt('C2-03', 300, 'correct', 3),
        attempt('C2-04', 300, 'correct', 4),
      ],
    })

    expect(result).toMatchObject({
      exercises: { solved: 4, total: 4 },
      transferRequirement: {
        exerciseId: 'C2-04',
        status: 'demonstrated',
      },
      mastery: true,
      missionComplete: true,
    })
  })
})

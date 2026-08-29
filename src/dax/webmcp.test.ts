import { describe, expect, it } from 'vitest'
import {
  deriveDaxLearningEvidence,
  isDaxMissionMastered,
} from './learning'
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
  it('exposes exactly the six intended DAX tools', () => {
    const tools = createDaxWebMcpTools(() => ({
      currentExerciseIndex: 0,
      attempts: [],
    }))

    expect(tools.map(({ name }) => name)).toEqual([
      'get_current_exercise',
      'inspect_filter_context',
      'get_attempt_history',
      'get_learning_progress',
      'request_socratic_intervention',
      'request_explanation',
    ])
  })

  it('keeps observation tools read-only and intervention annotations accurate', () => {
    const tools = createDaxWebMcpTools(() => ({
      currentExerciseIndex: 0,
      attempts: [],
    }))

    for (const tool of tools.slice(0, 4)) {
      expect(tool.annotations).toEqual({ readOnlyHint: true })
    }
    for (const tool of tools.slice(4)) {
      expect(tool.annotations).toBeUndefined()
    }
    for (const tool of tools) {
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

  it('returns pre-attempt Socratic support without revealing the answer', async () => {
    const result = await executeTool('request_socratic_intervention', {
      currentExerciseIndex: 0,
      attempts: [],
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      type: 'socratic',
      exerciseId: 'C2-01',
      learnerState: 'not_attempted',
    })
    expect(serialized).toContain('ALL(Sales[Region])')
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('450')
  })

  it('changes Socratic support after an incorrect attempt without leaking the answer', async () => {
    const beforeAttempt = await executeTool('request_socratic_intervention', {
      currentExerciseIndex: 0,
      attempts: [],
    })
    const afterIncorrect = await executeTool('request_socratic_intervention', {
      currentExerciseIndex: 0,
      attempts: [attempt('C2-01', 250, 'incorrect', 1)],
    })
    const serialized = JSON.stringify(afterIncorrect)

    expect(afterIncorrect).toMatchObject({
      exerciseId: 'C2-01',
      learnerState: 'incorrect',
    })
    expect(afterIncorrect.text).not.toBe(beforeAttempt.text)
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('450')
  })

  it('explains an unsolved concept without returning its numeric result', async () => {
    const result = await executeTool('request_explanation', {
      currentExerciseIndex: 0,
      attempts: [attempt('C2-01', 250, 'incorrect', 1)],
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      type: 'explanation',
      exerciseId: 'C2-01',
      learnerState: 'incorrect',
    })
    expect(serialized).toContain('modified filter context')
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('450')
  })

  it('uses the current exercise when choosing intervention content', async () => {
    let snapshot: DaxWebMcpSnapshot = {
      currentExerciseIndex: 0,
      attempts: [],
    }
    const tools = createDaxWebMcpTools(() => snapshot)
    const socraticTool = tools.find(
      ({ name }) => name === 'request_socratic_intervention',
    )

    const exerciseOne = (await socraticTool!.execute(
      {},
      executeOptions,
    )) as Record<string, unknown>
    snapshot = { currentExerciseIndex: 1, attempts: [] }
    const exerciseTwo = (await socraticTool!.execute(
      {},
      executeOptions,
    )) as Record<string, unknown>

    expect(exerciseOne.exerciseId).toBe('C2-01')
    expect(exerciseTwo.exerciseId).toBe('C2-02')
    expect(exerciseTwo.text).toContain('same Region column')
    expect(exerciseTwo.text).not.toBe(exerciseOne.text)
  })

  it('changes only support state and cannot create attempts, evidence, or mastery', async () => {
    const snapshot: DaxWebMcpSnapshot = {
      currentExerciseIndex: 0,
      attempts: [attempt('C2-01', 250, 'incorrect', 1)],
    }
    const beforeAttempts = structuredClone(snapshot.attempts)
    const beforeEvidence = deriveDaxLearningEvidence(snapshot.attempts)
    const beforeMastery = isDaxMissionMastered(beforeEvidence)
    const shownSupport: unknown[] = []
    const tools = createDaxWebMcpTools(
      () => snapshot,
      (support) => shownSupport.push(support),
    )

    for (const name of [
      'request_socratic_intervention',
      'request_explanation',
    ]) {
      await tools
        .find((tool) => tool.name === name)!
        .execute({}, executeOptions)
    }

    expect(shownSupport).toHaveLength(2)
    expect(snapshot.attempts).toEqual(beforeAttempts)
    const afterEvidence = deriveDaxLearningEvidence(snapshot.attempts)
    expect(afterEvidence).toEqual(beforeEvidence)
    expect(isDaxMissionMastered(afterEvidence)).toBe(beforeMastery)
  })
})

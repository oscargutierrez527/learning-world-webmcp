import { describe, expect, it } from 'vitest'
import { daxExercises } from './exercise'
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

function correctAttemptsThrough(count: number): DaxAttempt[] {
  return daxExercises.slice(0, count).map((exercise, index) =>
    attempt(exercise.id, exercise.expectedAnswer, 'correct', index + 1),
  )
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
  it('exposes exactly the seven intended DAX tools', () => {
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
      'request_filter_trace',
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
      attempts: [attempt('DAX-01', 250, 'incorrect', 1)],
    }
    const beforeExecution = structuredClone(snapshot)
    const tools = createDaxWebMcpTools(() => snapshot)

    await Promise.all(tools.map((tool) => tool.execute({}, executeOptions)))

    expect(snapshot).toEqual(beforeExecution)
    expect(tools.map(({ name }) => name).join(' ')).not.toMatch(
      /submit|create|set_|mark|complete|advance|fabricate/,
    )
  })

  it('reports DAX-01 as exercise 1 of 12 without leaking its answer', async () => {
    const result = await executeTool('get_current_exercise', {
      currentExerciseIndex: 0,
      attempts: [],
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      exerciseId: 'DAX-01',
      exerciseNumber: 1,
      totalExercises: 12,
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
      exerciseId: 'DAX-01',
      dataset: { name: 'Sales' },
      activeFilterContext: [{ column: 'Region', value: 'East' }],
    })
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('reasoningSteps')
    expect(serialized).not.toContain('450')
  })

  it('exposes DAX-10 relationship context without leaking its answer', async () => {
    const result = await executeTool('inspect_filter_context', {
      currentExerciseIndex: 9,
      attempts: correctAttemptsThrough(9),
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      exerciseId: 'DAX-10',
      dataset: { name: 'Customers' },
      relatedDatasets: [{ name: 'Sales' }],
      activeFilterContext: [
        { column: 'Customers[Region]', value: 'East' },
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
      attempts: [attempt('DAX-01', 250, 'incorrect', 1)],
    })

    expect(result).toEqual({
      empty: false,
      attempts: [
        {
          sequenceNumber: 1,
          exerciseId: 'DAX-01',
          submittedAnswer: 250,
          evaluation: 'incorrect',
          possibleMisconception: {
            id: 'M03',
            label: 'Assumes the targeted filter remains unchanged',
          },
        },
      ],
    })
  })

  it('returns null possible misconception for an unmapped wrong answer', async () => {
    const result = await executeTool('get_attempt_history', {
      currentExerciseIndex: 0,
      attempts: [attempt('DAX-01', 123, 'incorrect', 1)],
    })

    expect(result).toMatchObject({
      attempts: [{ possibleMisconception: null }],
    })
  })

  it('reports all S1-S8 demonstrated but transfer pending before DAX-12', async () => {
    const result = await executeTool('get_learning_progress', {
      currentExerciseIndex: 10,
      attempts: correctAttemptsThrough(11),
    })

    expect(result).toMatchObject({
      exercises: { solved: 11, total: 12 },
      demonstratedSkillIds: [
        'S1',
        'S2',
        'S3',
        'S4',
        'S5',
        'S6',
        'S7',
        'S8',
      ],
      remainingSkillIds: [],
      transferRequirement: {
        exerciseId: 'DAX-12',
        status: 'pending',
      },
      mastery: false,
      missionComplete: false,
    })
  })

  it('reports mastery and mission completion after all 12 correct attempts', async () => {
    const result = await executeTool('get_learning_progress', {
      currentExerciseIndex: 11,
      attempts: correctAttemptsThrough(12),
    })

    expect(result).toMatchObject({
      exercises: { solved: 12, total: 12 },
      transferRequirement: {
        exerciseId: 'DAX-12',
        status: 'demonstrated',
      },
      mastery: true,
      missionComplete: true,
    })
  })

  it('keeps mission completion false when mastery exists but an exercise is unsolved', async () => {
    const attempts = correctAttemptsThrough(12).filter(
      ({ exerciseId }) => exerciseId !== 'DAX-05',
    )
    const result = await executeTool('get_learning_progress', {
      currentExerciseIndex: 11,
      attempts,
    })

    expect(result).toMatchObject({
      exercises: { solved: 11, total: 12 },
      mastery: true,
      missionComplete: false,
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
      exerciseId: 'DAX-01',
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
      attempts: [attempt('DAX-01', 250, 'incorrect', 1)],
    })
    const serialized = JSON.stringify(afterIncorrect)

    expect(afterIncorrect).toMatchObject({
      exerciseId: 'DAX-01',
      learnerState: 'incorrect',
      possibleMisconception: { id: 'M03' },
    })
    expect(afterIncorrect.text).toContain('filter targeted')
    expect(afterIncorrect.text).not.toBe(beforeAttempt.text)
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('450')
  })

  it('explains an unsolved concept without returning its numeric result', async () => {
    const result = await executeTool('request_explanation', {
      currentExerciseIndex: 0,
      attempts: [attempt('DAX-01', 250, 'incorrect', 1)],
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      type: 'explanation',
      exerciseId: 'DAX-01',
      learnerState: 'incorrect',
    })
    expect(result).toMatchObject({
      possibleMisconception: { id: 'M03' },
    })
    expect(serialized).toContain('targeted CALCULATE filter modification')
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('450')
  })

  it('provides exercise-specific Socratic and explanation support for all 12', async () => {
    for (const [currentExerciseIndex, exercise] of daxExercises.entries()) {
      const snapshot = { currentExerciseIndex, attempts: [] }
      const socratic = await executeTool(
        'request_socratic_intervention',
        snapshot,
      )
      const explanation = await executeTool('request_explanation', snapshot)

      expect(socratic).toMatchObject({
        exerciseId: exercise.id,
        learnerState: 'not_attempted',
      })
      expect(explanation).toMatchObject({
        exerciseId: exercise.id,
        learnerState: 'not_attempted',
      })
      expect(String(socratic.text).length).toBeGreaterThan(20)
      expect(String(explanation.text).length).toBeGreaterThan(20)
      expect(String(socratic.text)).not.toContain(String(exercise.expectedAnswer))
      expect(String(explanation.text)).not.toContain(
        String(exercise.expectedAnswer),
      )
    }
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

    expect(exerciseOne.exerciseId).toBe('DAX-01')
    expect(exerciseTwo.exerciseId).toBe('DAX-02')
    expect(exerciseTwo.text).toContain('same Region column')
    expect(exerciseTwo.text).not.toBe(exerciseOne.text)
  })

  it('returns a misconception-aware unsolved filter trace without an answer', async () => {
    const result = await executeTool('request_filter_trace', {
      currentExerciseIndex: 2,
      attempts: [attempt('DAX-03', 500, 'incorrect', 1)],
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      type: 'filter_trace',
      mode: 'filter_trace',
      exerciseId: 'DAX-03',
      learnerState: 'incorrect',
      beforeFilters: ['Region = East', 'Channel = Online'],
      operation: 'ALL(Sales[Region])',
      possibleMisconception: { id: 'M02' },
      complete: false,
    })
    expect(result.focus).toEqual(
      expect.arrayContaining([
        'Separate the targeted column from every unrelated active filter.',
        'Rebuild the filter context before evaluating SUM.',
      ]),
    )
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('establishedReasoning')
    expect(serialized).not.toContain('"result"')
    expect(serialized).not.toContain('300')
  })

  it('returns established deterministic reasoning only after the exercise is solved', async () => {
    const result = await executeTool('request_filter_trace', {
      currentExerciseIndex: 2,
      attempts: [attempt('DAX-03', 300, 'correct', 1)],
    })

    expect(result).toMatchObject({
      type: 'filter_trace',
      exerciseId: 'DAX-03',
      learnerState: 'solved',
      complete: true,
      result: 300,
      possibleMisconception: null,
    })
    expect(result.establishedReasoning).toEqual(
      daxExercises[2].reasoningSteps,
    )
  })

  it('changes only support state and cannot create attempts, evidence, or mastery', async () => {
    const snapshot: DaxWebMcpSnapshot = {
      currentExerciseIndex: 0,
      attempts: [attempt('DAX-01', 250, 'incorrect', 1)],
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
      'request_filter_trace',
    ]) {
      await tools
        .find((tool) => tool.name === name)!
        .execute({}, executeOptions)
    }

    expect(shownSupport).toHaveLength(3)
    expect(snapshot.attempts).toEqual(beforeAttempts)
    const afterEvidence = deriveDaxLearningEvidence(snapshot.attempts)
    expect(afterEvidence).toEqual(beforeEvidence)
    expect(isDaxMissionMastered(afterEvidence)).toBe(beforeMastery)
  })
})

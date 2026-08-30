// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  buildDaxCoachSnapshot,
  executeDaxCoachWebMcp,
  requestDaxCoachSelection,
} from './activeCoach'
import { daxExercises } from './exercise'
import type { DaxAttempt } from './types'

function incorrectAttempt(answer = 250): DaxAttempt {
  return {
    id: 'DAX-01-attempt-1',
    exerciseId: 'DAX-01',
    submittedAnswer: answer,
    result: 'incorrect',
    sequenceNumber: 1,
  }
}

describe('DAX Active Learning Coach client contract', () => {
  it('builds a bounded mapped snapshot without answer-key fields', () => {
    const attempt = incorrectAttempt()
    const snapshot = buildDaxCoachSnapshot({
      exercise: daxExercises[0],
      currentAttempt: attempt,
      attempts: [attempt],
      demonstratedSkillIds: ['S1'],
      priorInterventions: ['socratic'],
    })

    expect(snapshot).toMatchObject({
      missionId: 'dax-calculate-filter-context',
      exercise: {
        id: 'DAX-01',
        concept: 'Removing a column filter',
        activeFilterContext: [{ column: 'Region', value: 'East' }],
        filterOperation: 'ALL(Sales[Region])',
        relationshipSummary: null,
      },
      currentAttempt: {
        attemptId: 'DAX-01-attempt-1',
        submittedAnswer: 250,
        evaluation: 'incorrect',
        possibleMisconception: { id: 'M03' },
      },
      demonstratedSkillIds: ['S1'],
      priorInterventions: ['socratic'],
    })
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('expectedAnswer')
    expect(serialized).not.toContain('reasoningSteps')
    expect(serialized).not.toContain('solvedContext')
    expect(serialized).not.toContain('visibleRows')
  })

  it('includes null for an unmapped incorrect answer', () => {
    const attempt = incorrectAttempt(123)
    const snapshot = buildDaxCoachSnapshot({
      exercise: daxExercises[0],
      currentAttempt: attempt,
      attempts: [attempt],
      demonstratedSkillIds: [],
      priorInterventions: [],
    })

    expect(snapshot.possibleMisconception).toBeNull()
    expect(snapshot.currentAttempt.possibleMisconception).toBeNull()
  })

  it('requests one strict selection from the same-origin coach endpoint', async () => {
    const attempt = incorrectAttempt()
    const snapshot = buildDaxCoachSnapshot({
      exercise: daxExercises[0],
      currentAttempt: attempt,
      attempts: [attempt],
      demonstratedSkillIds: [],
      priorInterventions: [],
    })
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json({ intervention: 'explanation' }),
    )

    await expect(
      requestDaxCoachSelection(
        snapshot,
        new AbortController().signal,
        fetchImplementation,
      ),
    ).resolves.toEqual({ intervention: 'explanation' })
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/active-coach',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(snapshot) }),
    )
  })

  it.each([
    ['socratic', 'request_socratic_intervention'],
    ['explanation', 'request_explanation'],
    ['filter_trace', 'request_filter_trace'],
  ] as const)(
    'executes %s through the matching discovered WebMCP tool',
    async (intervention, toolName) => {
      const tool = {
        name: toolName,
        title: toolName,
        description: toolName,
        origin: window.location.origin,
        window,
      } as WebMCP.RegisteredTool
      const getTools = vi.fn().mockResolvedValue([tool])
      const executeTool = vi.fn().mockResolvedValue(
        JSON.stringify({ type: intervention, exerciseId: 'DAX-01' }),
      )
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        value: { getTools, executeTool },
      })

      await expect(
        executeDaxCoachWebMcp(
          intervention,
          'DAX-01',
          new AbortController().signal,
        ),
      ).resolves.toBe('executed')
      expect(executeTool).toHaveBeenCalledWith(
        tool,
        {},
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    },
  )

  it('does not bypass WebMCP when execution is unavailable', async () => {
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: undefined,
    })

    await expect(
      executeDaxCoachWebMcp(
        'socratic',
        'DAX-01',
        new AbortController().signal,
      ),
    ).resolves.toBe('unavailable')
  })
})

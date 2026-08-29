// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { persistDaxMissionState } from './persistence'
import type { DaxAttempt } from './types'
import { useDaxWebMcp } from './useDaxWebMcp'
import type { DaxWebMcpSnapshot } from './webmcp'

function setDocumentModelContext(modelContext: unknown) {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: modelContext,
  })
}

function setNavigatorModelContext(modelContext: unknown) {
  Object.defineProperty(navigator, 'modelContext', {
    configurable: true,
    value: modelContext,
  })
}

function WebMcpHarness({ snapshot }: { snapshot: DaxWebMcpSnapshot }) {
  useDaxWebMcp(snapshot, () => undefined)
  return null
}

beforeEach(() => localStorage.clear())

afterEach(() => {
  cleanup()
  setDocumentModelContext(undefined)
  setNavigatorModelContext(undefined)
})

describe('useDaxWebMcp', () => {
  it('keeps the learner application functional when WebMCP is unavailable', async () => {
    const user = userEvent.setup()
    setDocumentModelContext(undefined)

    render(<App />)
    await user.type(screen.getByLabelText('Your numeric answer'), '250')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    expect(
      screen.getByRole('region', { name: 'Learning World evaluation' }),
    ).toHaveTextContent('250Incorrect')
    expect(
      screen.getByRole('region', { name: 'Attempt history' }),
    ).toBeInTheDocument()
  })

  it('registers through document.modelContext and never navigator.modelContext', async () => {
    const documentRegisterTool = vi.fn().mockResolvedValue(undefined)
    const navigatorRegisterTool = vi.fn().mockResolvedValue(undefined)
    setDocumentModelContext({ registerTool: documentRegisterTool })
    setNavigatorModelContext({ registerTool: navigatorRegisterTool })

    render(
      <WebMcpHarness snapshot={{ currentExerciseIndex: 0, attempts: [] }} />,
    )

    await waitFor(() => expect(documentRegisterTool).toHaveBeenCalledTimes(7))
    expect(navigatorRegisterTool).not.toHaveBeenCalled()
    expect(
      documentRegisterTool.mock.calls.every((call) =>
        call[1].signal instanceof AbortSignal,
      ),
    ).toBe(true)
  })

  it('executes registered tools against the latest React snapshot', async () => {
    const registeredTools: WebMCP.ModelContextTool[] = []
    const registerTool = vi.fn(
      async (tool: WebMCP.ModelContextTool) => void registeredTools.push(tool),
    )
    setDocumentModelContext({ registerTool })

    const initialSnapshot: DaxWebMcpSnapshot = {
      currentExerciseIndex: 0,
      attempts: [],
    }
    const { rerender } = render(
      <WebMcpHarness snapshot={initialSnapshot} />,
    )
    await waitFor(() => expect(registerTool).toHaveBeenCalledTimes(7))

    const attemptHistoryTool = registeredTools.find(
      ({ name }) => name === 'get_attempt_history',
    )
    expect(attemptHistoryTool).toBeDefined()

    await expect(
      Promise.resolve(
        attemptHistoryTool!.execute(
          {},
          { signal: new AbortController().signal },
        ),
      ),
    ).resolves.toEqual({ empty: true, attempts: [] })

    const learnerAttempt: DaxAttempt = {
      id: 'DAX-01-attempt-1',
      exerciseId: 'DAX-01',
      submittedAnswer: 250,
      result: 'incorrect',
      sequenceNumber: 1,
    }
    rerender(
      <WebMcpHarness
        snapshot={{ currentExerciseIndex: 0, attempts: [learnerAttempt] }}
      />,
    )

    await expect(
      Promise.resolve(
        attemptHistoryTool!.execute(
          {},
          { signal: new AbortController().signal },
        ),
      ),
    ).resolves.toMatchObject({
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

  it('shows requested support without changing authoritative learner state', async () => {
    const user = userEvent.setup()
    const registeredTools: WebMCP.ModelContextTool[] = []
    const registerTool = vi.fn(
      async (tool: WebMCP.ModelContextTool) => void registeredTools.push(tool),
    )
    setDocumentModelContext({ registerTool })

    render(<App />)
    await waitFor(() => expect(registerTool).toHaveBeenCalledTimes(7))

    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/A compatible external agent can observe this live state/)).toBeInTheDocument()

    const socraticTool = registeredTools.find(
      ({ name }) => name === 'request_socratic_intervention',
    )
    const historyTool = registeredTools.find(
      ({ name }) => name === 'get_attempt_history',
    )
    const progressTool = registeredTools.find(
      ({ name }) => name === 'get_learning_progress',
    )
    const filterTraceTool = registeredTools.find(
      ({ name }) => name === 'request_filter_trace',
    )
    const explanationTool = registeredTools.find(
      ({ name }) => name === 'request_explanation',
    )
    expect(socraticTool).toBeDefined()
    expect(historyTool).toBeDefined()
    expect(progressTool).toBeDefined()
    expect(filterTraceTool).toBeDefined()
    expect(explanationTool).toBeDefined()

    const executeOptions = { signal: new AbortController().signal }
    const progressBefore = await progressTool!.execute({}, executeOptions)

    await act(async () => {
      await Promise.resolve(socraticTool!.execute({}, executeOptions))
    })

    let supportRegion = screen.getByRole('region', {
      name: 'AI Agent intervention',
    })
    expect(within(supportRegion).getByText('Socratic').closest('li')).toHaveTextContent(
      'Selected by AI Agent',
    )
    expect(supportRegion).toHaveTextContent('via WebMCP')
    expect(supportRegion).toHaveTextContent(
      'Assistance provided · Learning evidence unchanged',
    )
    expect(supportRegion).toHaveTextContent('ALL(Sales[Region])')
    await expect(
      Promise.resolve(historyTool!.execute({}, executeOptions)),
    ).resolves.toEqual({ empty: true, attempts: [] })
    await expect(
      Promise.resolve(progressTool!.execute({}, executeOptions)),
    ).resolves.toEqual(progressBefore)
    expect(
      screen.queryByRole('region', { name: 'Attempt history' }),
    ).not.toBeInTheDocument()

    await act(async () => {
      await Promise.resolve(explanationTool!.execute({}, executeOptions))
    })

    supportRegion = screen.getByRole('region', {
      name: 'AI Agent intervention',
    })
    expect(
      within(supportRegion).getByText('Explanation').closest('li'),
    ).toHaveTextContent('Selected by AI Agent')
    expect(supportRegion).toHaveTextContent('via WebMCP')
    await expect(
      Promise.resolve(historyTool!.execute({}, executeOptions)),
    ).resolves.toEqual({ empty: true, attempts: [] })
    await expect(
      Promise.resolve(progressTool!.execute({}, executeOptions)),
    ).resolves.toEqual(progressBefore)

    await act(async () => {
      await Promise.resolve(filterTraceTool!.execute({}, executeOptions))
    })

    supportRegion = screen.getByRole('region', {
      name: 'AI Agent intervention',
    })
    expect(
      within(supportRegion).getByText('Filter trace').closest('li'),
    ).toHaveTextContent('Selected by AI Agent')
    expect(supportRegion).toHaveTextContent('Region = East')
    expect(supportRegion).toHaveTextContent('ALL(Sales[Region])')
    await expect(
      Promise.resolve(historyTool!.execute({}, executeOptions)),
    ).resolves.toEqual({ empty: true, attempts: [] })
    await expect(
      Promise.resolve(progressTool!.execute({}, executeOptions)),
    ).resolves.toEqual(progressBefore)

    await user.type(screen.getByLabelText('Your numeric answer'), '250')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))
    expect(
      screen.getByRole('region', { name: 'Attempt history' }),
    ).toBeInTheDocument()
  })

  it('places a real post-error Socratic event between evaluation and learner retry', async () => {
    const user = userEvent.setup()
    const registeredTools: WebMCP.ModelContextTool[] = []
    setDocumentModelContext({
      registerTool: async (tool: WebMCP.ModelContextTool) =>
        void registeredTools.push(tool),
    })

    render(<App />)
    await waitFor(() => expect(registeredTools).toHaveLength(7))

    await user.type(screen.getByLabelText('Your numeric answer'), '250')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    const executeOptions = { signal: new AbortController().signal }
    const getTool = (name: string) =>
      registeredTools.find((tool) => tool.name === name)!
    const historyBefore = await getTool('get_attempt_history').execute(
      {},
      executeOptions,
    )
    const progressBefore = await getTool('get_learning_progress').execute(
      {},
      executeOptions,
    )

    await act(async () => {
      await Promise.resolve(
        getTool('request_socratic_intervention').execute({}, executeOptions),
      )
    })

    const learnerAttempt = screen.getByRole('region', { name: 'Learner attempt' })
    const evaluation = screen.getByRole('region', {
      name: 'Learning World evaluation',
    })
    const agentEvent = screen.getByRole('region', {
      name: 'AI Agent intervention',
    })
    const retry = screen.getByRole('region', {
      name: 'Demonstrate the reasoning again',
    })
    const isBefore = (first: HTMLElement, second: HTMLElement) =>
      Boolean(
        first.compareDocumentPosition(second) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      )

    expect(isBefore(learnerAttempt, evaluation)).toBe(true)
    expect(isBefore(evaluation, agentEvent)).toBe(true)
    expect(isBefore(agentEvent, retry)).toBe(true)
    expect(agentEvent).toHaveTextContent(
      'Attempt #1 · 250 · incorrectPossible M03',
    )
    expect(
      within(agentEvent).getByText('Socratic').closest('li'),
    ).toHaveTextContent('Selected by AI Agent')
    expect(agentEvent).toHaveTextContent(
      'Assistance provided · Learning evidence unchanged',
    )

    await expect(
      Promise.resolve(
        getTool('get_attempt_history').execute({}, executeOptions),
      ),
    ).resolves.toEqual(historyBefore)
    await expect(
      Promise.resolve(
        getTool('get_learning_progress').execute({}, executeOptions),
      ),
    ).resolves.toEqual(progressBefore)
  })

  it('exposes restored state and then the fresh reset state through WebMCP', async () => {
    const user = userEvent.setup()
    const registeredTools: WebMCP.ModelContextTool[] = []
    const registerTool = vi.fn(
      async (tool: WebMCP.ModelContextTool) => void registeredTools.push(tool),
    )
    setDocumentModelContext({ registerTool })
    const restoredAttempts: DaxAttempt[] = [
      {
        id: 'DAX-01-attempt-1',
        exerciseId: 'DAX-01',
        submittedAnswer: 450,
        result: 'correct',
        sequenceNumber: 1,
      },
      {
        id: 'DAX-02-attempt-2',
        exerciseId: 'DAX-02',
        submittedAnswer: 0,
        result: 'incorrect',
        sequenceNumber: 2,
      },
    ]
    persistDaxMissionState(restoredAttempts, 'DAX-02')

    render(<App />)
    await waitFor(() => expect(registerTool).toHaveBeenCalledTimes(7))

    const getTool = (name: string) =>
      registeredTools.find((tool) => tool.name === name)!
    const executeOptions = { signal: new AbortController().signal }

    await expect(
      Promise.resolve(
        getTool('get_current_exercise').execute({}, executeOptions),
      ),
    ).resolves.toMatchObject({ exerciseId: 'DAX-02', exerciseNumber: 2 })
    await expect(
      Promise.resolve(getTool('get_attempt_history').execute({}, executeOptions)),
    ).resolves.toMatchObject({
      empty: false,
      attempts: [
        { exerciseId: 'DAX-01', evaluation: 'correct' },
        {
          exerciseId: 'DAX-02',
          evaluation: 'incorrect',
          possibleMisconception: { id: 'M04' },
        },
      ],
    })
    await expect(
      Promise.resolve(getTool('get_learning_progress').execute({}, executeOptions)),
    ).resolves.toMatchObject({
      exercises: { solved: 1, total: 12 },
      currentExercise: { exerciseId: 'DAX-02' },
      demonstratedSkillIds: ['S1', 'S2'],
      mastery: false,
      missionComplete: false,
    })

    await act(async () => {
      await Promise.resolve(
        getTool('request_explanation').execute({}, executeOptions),
      )
    })
    expect(
      screen.getByRole('region', { name: 'AI Agent intervention' }),
    ).toHaveTextContent('Explanation intervention')

    await user.click(screen.getByRole('button', { name: 'Reset mission' }))
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }))

    await waitFor(async () => {
      await expect(
        Promise.resolve(
          getTool('get_current_exercise').execute({}, executeOptions),
        ),
      ).resolves.toMatchObject({ exerciseId: 'DAX-01', exerciseNumber: 1 })
      await expect(
        Promise.resolve(
          getTool('get_attempt_history').execute({}, executeOptions),
        ),
      ).resolves.toEqual({ empty: true, attempts: [] })
      await expect(
        Promise.resolve(
          getTool('get_learning_progress').execute({}, executeOptions),
        ),
      ).resolves.toMatchObject({
        exercises: { solved: 0, total: 12 },
        currentExercise: { exerciseId: 'DAX-01' },
        demonstratedSkillIds: [],
        transferRequirement: { status: 'pending' },
        mastery: false,
        missionComplete: false,
      })
    })
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/A compatible external agent can observe this live state/)).toBeInTheDocument()
  })

  it('does not persist Agent Support across a remount', async () => {
    const registeredTools: WebMCP.ModelContextTool[] = []
    const registerTool = vi.fn(
      async (tool: WebMCP.ModelContextTool) => void registeredTools.push(tool),
    )
    setDocumentModelContext({ registerTool })

    const { unmount } = render(<App />)
    await waitFor(() => expect(registerTool).toHaveBeenCalledTimes(7))
    const socraticTool = registeredTools.find(
      ({ name }) => name === 'request_socratic_intervention',
    )!

    await act(async () => {
      await Promise.resolve(
        socraticTool.execute({}, { signal: new AbortController().signal }),
      )
    })
    expect(
      screen.getByRole('region', { name: 'AI Agent intervention' }),
    ).toHaveTextContent('Socratic intervention')

    unmount()
    registeredTools.splice(0)
    render(<App />)
    await waitFor(() => expect(registeredTools).toHaveLength(7))

    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/A compatible external agent can observe this live state/)).toBeInTheDocument()
  })
})

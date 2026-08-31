// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { persistDaxMissionState } from './persistence'
import type { DaxAttempt } from './types'

function setDocumentModelContext(modelContext: unknown) {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: modelContext,
  })
}

function installExecutableWebMcp() {
  const registeredTools: WebMCP.ModelContextTool[] = []
  const registerTool = vi.fn(async (tool: WebMCP.ModelContextTool) => {
    registeredTools.push(tool)
  })
  const getTools = vi.fn(async () =>
    registeredTools.map(
      ({ name, title, description, inputSchema, annotations }) =>
        ({
          name,
          title: title ?? name,
          description,
          inputSchema,
          annotations,
          origin: window.location.origin,
          window,
        }) as WebMCP.RegisteredTool,
    ),
  )
  const executeTool = vi.fn(
    async (
      registeredTool: WebMCP.RegisteredTool,
      input: string,
      options?: { signal?: AbortSignal },
    ) => {
      const tool = registeredTools.find(
        ({ name }) => name === registeredTool.name,
      )!
      const result = await tool.execute(JSON.parse(input), {
        signal: options?.signal ?? new AbortController().signal,
      })
      return JSON.stringify(result)
    },
  )

  setDocumentModelContext({ registerTool, getTools, executeTool })
  return { registeredTools, registerTool, getTools, executeTool }
}

async function submit(answer: number) {
  const user = userEvent.setup()
  const input = screen.getByLabelText('Your numeric answer')
  await user.clear(input)
  await user.type(input, String(answer))
  await user.click(screen.getByRole('button', { name: 'Submit prediction' }))
}

beforeEach(() => {
  localStorage.clear()
  setDocumentModelContext(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setDocumentModelContext(undefined)
})

describe('embedded DAX Active Learning Coach flow', () => {
  it('does not call the coach for a correct learner attempt', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    installExecutableWebMcp()
    render(<App />)

    await submit(450)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('Evidence established')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'AI Agent live path' }))
      .toHaveTextContent('Select intervention— Not required')
  })

  it('calls the coach exactly once for a new incorrect attempt across rerenders', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    installExecutableWebMcp()
    const view = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await submit(250)
    view.rerender(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const rail = screen.getByRole('complementary', {
      name: 'AI Agent live path',
    })
    expect(rail).toHaveTextContent('Active Learning Coach')
    expect(rail).toHaveTextContent('Selecting bounded assistance...')
  })

  it('does not call the coach for a restored old incorrect attempt', () => {
    const restoredAttempt: DaxAttempt = {
      id: 'DAX-01-attempt-1',
      exerciseId: 'DAX-01',
      submittedAnswer: 250,
      result: 'incorrect',
      sequenceNumber: 1,
    }
    persistDaxMissionState([restoredAttempt], 'DAX-01')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    installExecutableWebMcp()

    render(<App />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('complementary', { name: 'AI Agent live path' }))
      .toHaveTextContent('Restored learner attempt')
  })

  it('runs for an unmapped wrong answer and exposes no invented signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ intervention: 'socratic' }),
    )
    vi.stubGlobal('fetch', fetchMock)
    installExecutableWebMcp()
    render(<App />)

    await submit(123)

    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'AI Agent intervention' }),
      ).toBeInTheDocument(),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestSnapshot = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestSnapshot.possibleMisconception).toBeNull()
    expect(
      screen.queryByRole('note', { name: 'Possible misconception' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'AI Agent live path' }))
      .toHaveTextContent('No mapped signal for this answer')
  })

  it.each([
    ['socratic', 'request_socratic_intervention', 'Socratic'],
    ['explanation', 'request_explanation', 'Explanation'],
    ['filter_trace', 'request_filter_trace', 'Filter trace'],
  ] as const)(
    'binds %s selection to the real %s WebMCP result and rail',
    async (intervention, toolName, label) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ intervention })),
      )
      const boundary = installExecutableWebMcp()
      render(<App />)
      await waitFor(() => expect(boundary.registerTool).toHaveBeenCalledTimes(7))

      await submit(250)

      const support = await screen.findByRole('region', {
        name: 'AI Agent intervention',
      })
      const rail = screen.getByRole('complementary', {
        name: 'AI Agent live path',
      })
      const capabilities = within(rail).getByRole('list', {
        name: 'Agent assistance capabilities',
      })
      expect(boundary.executeTool).toHaveBeenCalledTimes(1)
      expect(boundary.executeTool.mock.calls[0][0].name).toBe(toolName)
      expect(boundary.executeTool.mock.calls[0][1]).toBe(JSON.stringify({}))
      expect(support).toHaveTextContent('Active Learning Coach · via WebMCP')
      expect(support).toHaveTextContent(`Selected intervention · ${label}`)
      expect(support).toHaveTextContent('Assistance does not create evidence.')
      expect(within(capabilities).getByText(label).closest('li')).toHaveClass(
        'selected',
      )
      expect(rail).toHaveTextContent('Selected by Active Learning Coach')
      expect(rail).toHaveTextContent('Assist✓ Completed')
      expect(rail).toHaveTextContent('Via WebMCP')
      expect(
        within(
          screen.getByRole('region', { name: 'Attempt history' }),
        ).getAllByRole('listitem'),
      ).toHaveLength(1)
      expect(rail).toHaveTextContent('Evidence0 / 8 skills')
      expect(rail).toHaveTextContent('TransferPending')
      expect(rail).toHaveTextContent('MasteryPending')
    },
  )

  it('runs again after a second error and sends prior intervention trajectory', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ intervention: 'socratic' }))
      .mockResolvedValueOnce(Response.json({ intervention: 'explanation' }))
    vi.stubGlobal('fetch', fetchMock)
    installExecutableWebMcp()
    render(<App />)

    await submit(250)
    await screen.findByText('Selected intervention · Socratic')
    await submit(123)
    await screen.findByText('Selected intervention · Explanation')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondSnapshot = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondSnapshot.priorInterventions).toEqual(['socratic'])
    expect(secondSnapshot.recentAttempts).toHaveLength(2)
    expect(secondSnapshot.currentAttempt.submittedAnswer).toBe(123)
    expect(
      within(
        screen.getByRole('region', { name: 'Attempt history' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(2)
    expect(screen.getByRole('complementary', { name: 'AI Agent live path' }))
      .toHaveTextContent('Evidence0 / 8 skills')
  })

  it('cannot attach a stale first selection to the newer attempt', async () => {
    let resolveFirst: ((response: Response) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce(Response.json({ intervention: 'explanation' }))
    vi.stubGlobal('fetch', fetchMock)
    const boundary = installExecutableWebMcp()
    render(<App />)
    await waitFor(() => expect(boundary.registerTool).toHaveBeenCalledTimes(7))

    await submit(250)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await submit(123)
    await screen.findByText('Selected intervention · Explanation')
    resolveFirst?.(Response.json({ intervention: 'socratic' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const support = screen.getByRole('region', {
      name: 'AI Agent intervention',
    })
    expect(support).toHaveTextContent('Selected intervention · Explanation')
    expect(support).not.toHaveTextContent('Selected intervention · Socratic')
    expect(boundary.executeTool).toHaveBeenCalledTimes(1)
  })

  it('cannot attach a stale coach completion after learner success and navigation', async () => {
    let resolveSelection: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveSelection = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const boundary = installExecutableWebMcp()
    render(<App />)
    await waitFor(() => expect(boundary.registerTool).toHaveBeenCalledTimes(7))

    await submit(250)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await submit(450)
    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Continue to exercise 2' }),
    )
    resolveSelection?.(Response.json({ intervention: 'filter_trace' }))

    await waitFor(() =>
      expect(
        screen.getByText('DAX-02', { selector: '.exercise-id span' }),
      ).toBeInTheDocument(),
    )
    expect(boundary.executeTool).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mission status')).toHaveTextContent(
      'Exercise2 / 12Skills2 / 8TransferPending',
    )
  })

  it('cannot attach a stale coach completion after mission reset', async () => {
    let resolveSelection: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveSelection = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const boundary = installExecutableWebMcp()
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(boundary.registerTool).toHaveBeenCalledTimes(7))

    await submit(250)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Reset mission' }))
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }))
    resolveSelection?.(Response.json({ intervention: 'explanation' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Mission status')).toHaveTextContent(
        'Exercise1 / 12Skills0 / 8TransferPending',
      ),
    )
    expect(boundary.executeTool).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('region', { name: 'Attempt history' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
  })

  it('clears delivered assistance and authoritative state on reset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ intervention: 'socratic' })),
    )
    installExecutableWebMcp()
    const user = userEvent.setup()
    render(<App />)

    await submit(250)
    await screen.findByText('Selected intervention · Socratic')
    await user.click(screen.getByRole('button', { name: 'Reset mission' }))
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }))

    expect(screen.getByLabelText('Mission status')).toHaveTextContent(
      'Exercise1 / 12Skills0 / 8TransferPending',
    )
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Attempt history' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Commit to a result' })).toBeVisible()
  })

  it('keeps the mission usable when coach selection fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({}, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    installExecutableWebMcp()
    render(<App />)

    await submit(250)
    await waitFor(() =>
      expect(screen.getByRole('complementary', { name: 'AI Agent live path' }))
        .toHaveTextContent('Coach unavailable'),
    )
    expect(screen.getByLabelText('Your numeric answer')).toBeEnabled()

    await submit(450)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Evidence established')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'AI Agent live path' }))
      .toHaveTextContent('Evidence established from learner Attempt #2')
  })

  it('shows truthful WebMCP-unavailable state without an internal support bypass', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ intervention: 'filter_trace' }),
    )
    vi.stubGlobal('fetch', fetchMock)
    setDocumentModelContext(undefined)
    render(<App />)

    await submit(250)

    await waitFor(() =>
      expect(screen.getByRole('complementary', { name: 'AI Agent live path' }))
        .toHaveTextContent('WebMCP unavailable in this browser'),
    )
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your numeric answer')).toBeEnabled()
  })

  it('distinguishes a native WebMCP execution failure from browser unavailability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ intervention: 'filter_trace' })),
    )
    const boundary = installExecutableWebMcp()
    boundary.executeTool.mockRejectedValueOnce(new Error('execution failed'))
    render(<App />)
    await waitFor(() => expect(boundary.registerTool).toHaveBeenCalledTimes(7))

    await submit(250)

    const rail = screen.getByRole('complementary', {
      name: 'AI Agent live path',
    })
    await waitFor(() =>
      expect(rail).toHaveTextContent('WebMCP execution failed'),
    )
    expect(rail).not.toHaveTextContent('WebMCP unavailable in this browser')
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your numeric answer')).toBeEnabled()
  })

  it('creates evidence only from the correct learner retry after assistance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ intervention: 'socratic' }))
    vi.stubGlobal('fetch', fetchMock)
    installExecutableWebMcp()
    render(<App />)

    await submit(250)
    await screen.findByText('Selected intervention · Socratic')
    expect(screen.getByRole('complementary', { name: 'AI Agent live path' }))
      .toHaveTextContent('Evidence0 / 8 skills')

    await submit(450)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const evaluation = screen.getByRole('region', {
      name: 'Learning World evaluation',
    })
    const rail = screen.getByRole('complementary', {
      name: 'AI Agent live path',
    })
    expect(evaluation).toHaveTextContent('Attempt #2')
    expect(evaluation).toHaveTextContent('Evidence establishedS1 · S2')
    expect(rail).toHaveTextContent('delivered for Attempt #1')
    expect(rail).toHaveTextContent('Evidence established from learner Attempt #2')
    expect(rail).toHaveTextContent('Evidence2 / 8 skills')
  })
})

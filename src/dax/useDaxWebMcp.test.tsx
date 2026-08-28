// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
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
  useDaxWebMcp(snapshot)
  return null
}

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

    expect(screen.getByText('Incorrect prediction')).toBeInTheDocument()
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

    await waitFor(() => expect(documentRegisterTool).toHaveBeenCalledTimes(4))
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
    await waitFor(() => expect(registerTool).toHaveBeenCalledTimes(4))

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
      id: 'C2-01-attempt-1',
      exerciseId: 'C2-01',
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
          exerciseId: 'C2-01',
          submittedAnswer: 250,
          evaluation: 'incorrect',
        },
      ],
    })
  })
})

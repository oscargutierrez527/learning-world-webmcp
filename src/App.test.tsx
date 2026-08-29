// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { daxExercises } from './dax/exercise'
import {
  DAX_MISSION_STORAGE_KEY,
  persistDaxMissionState,
} from './dax/persistence'
import type { DaxAttempt } from './dax/types'

const expectedAnswers = [
  450, 300, 300, 250, 250, 150, 50, 250, 500, 450, 200, 300,
]

async function solveCurrentExercise(
  user: ReturnType<typeof userEvent.setup>,
  answer: number,
  nextExerciseNumber?: number,
) {
  await user.type(screen.getByLabelText('Your numeric answer'), String(answer))
  await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

  if (nextExerciseNumber) {
    await user.click(
      screen.getByRole('button', {
        name: `Continue to exercise ${nextExerciseNumber}`,
      }),
    )
  }
}

function isBefore(first: HTMLElement, second: HTMLElement) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  )
}

afterEach(cleanup)
beforeEach(() => localStorage.clear())

describe('DAX learner attempt flow', () => {
  it('opens with mission purpose, live actors, context, and learner action before global detail', () => {
    render(<App />)

    expect(
      screen.getByText(
        'Predict how CALCULATE changes the context around a measure.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Only evaluated learner attempts create evidence/),
    ).toBeInTheDocument()

    const actors = screen.getByRole('region', {
      name: 'Live learning actors',
    })
    expect(actors).toHaveTextContent('LearnerPrediction required')
    expect(actors).toHaveTextContent('Learning WorldAwaiting learner attempt')
    expect(actors).toHaveTextContent(
      'AI Agent · WebMCPWaiting for a WebMCP request',
    )

    const world = screen.getByRole('region', { name: 'Current DAX world' })
    const prediction = screen.getByRole('region', {
      name: 'Commit to a result',
    })
    const globalDetail = screen.getByText('View mission progress')
    expect(isBefore(world, prediction)).toBe(true)
    expect(isBefore(prediction, globalDetail)).toBe(true)
    expect(screen.getByRole('button', { name: 'Submit prediction' })).toBeVisible()

    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    for (const mode of ['Socratic', 'Explanation', 'Filter trace']) {
      expect(screen.queryByRole('button', { name: mode })).not.toBeInTheDocument()
    }
  })

  it('keeps the earned result and solved context hidden before success', () => {
    render(<App />)

    expect(screen.queryByText(/^Why 450\?$/)).not.toBeInTheDocument()
    expect(screen.queryByText('East / 100')).not.toBeInTheDocument()
    expect(screen.queryByText('Region filter removed')).not.toBeInTheDocument()
    expect(screen.queryByText('450')).not.toBeInTheDocument()
  })

  it('places a mapped incorrect evaluation directly after the learner attempt', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Your numeric answer'), '250')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    const learnerAttempt = screen.getByRole('region', { name: 'Learner attempt' })
    const evaluation = screen.getByRole('region', {
      name: 'Learning World evaluation',
    })
    const retry = screen.getByRole('region', {
      name: 'Demonstrate the reasoning again',
    })
    expect(learnerAttempt).toHaveTextContent('250Attempt #1DAX-01')
    expect(evaluation).toHaveTextContent('250Incorrect')
    expect(isBefore(learnerAttempt, evaluation)).toBe(true)
    expect(isBefore(evaluation, retry)).toBe(true)

    const possibleMisconception = within(evaluation).getByRole('note', {
      name: 'Possible misconception',
    })
    expect(possibleMisconception).toHaveTextContent('M03')
    expect(possibleMisconception).toHaveTextContent(
      'Assumes the targeted filter remains unchanged',
    )
    expect(possibleMisconception).toHaveTextContent(
      'This is a reasoning signal, not a diagnosis.',
    )
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/^Why 450\?$/)).not.toBeInTheDocument()

    const history = screen.getByRole('region', { name: 'Attempt history' })
    expect(within(history).getByRole('listitem')).toHaveTextContent(
      'Attempt #1DAX-01M03 · Possible misconception250Incorrect',
    )
  })

  it('invents no misconception for an unmapped incorrect answer', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Your numeric answer'), '251')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    expect(
      screen.getByRole('region', { name: 'Learning World evaluation' }),
    ).toHaveTextContent('251Incorrect')
    expect(
      screen.queryByRole('note', { name: 'Possible misconception' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/^Why 450\?$/)).not.toBeInTheDocument()
  })

  it('records the retry, establishes evidence, and immediately reveals a vertical explanation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await solveCurrentExercise(user, 250)
    await solveCurrentExercise(user, 450)

    const history = screen.getByRole('region', { name: 'Attempt history' })
    const attempts = within(history).getAllByRole('listitem')
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toHaveTextContent('Attempt #2DAX-01450Correct')

    const learnerAttempt = screen.getByRole('region', { name: 'Learner attempt' })
    const evaluation = screen.getByRole('region', {
      name: 'Learning World evaluation',
    })
    const explanation = screen.getByRole('region', { name: 'Why 450?' })
    expect(learnerAttempt).toHaveTextContent('450')
    expect(evaluation).toHaveTextContent('450Correct')
    expect(evaluation).toHaveTextContent('Evidence recordedS1 · S2')
    expect(isBefore(learnerAttempt, evaluation)).toBe(true)
    expect(isBefore(evaluation, explanation)).toBe(true)

    const orderedStages = [
      'Before CALCULATE',
      'Filter modification',
      'After CALCULATE',
      'Visible rows',
      'Result',
    ].map((name) => within(explanation).getByRole('listitem', { name }))
    orderedStages.slice(0, -1).forEach((stage, index) => {
      expect(isBefore(stage, orderedStages[index + 1])).toBe(true)
    })
    expect(orderedStages[1]).toHaveTextContent(
      'ALL(Sales[Region])Removes the existing filter on Sales[Region].',
    )
    expect(orderedStages[4]).toHaveTextContent('450')
  })

  it('does not create attempts for blank or invalid input', async () => {
    const user = userEvent.setup()
    render(<App />)
    const answerInput = screen.getByLabelText('Your numeric answer')
    const submitButton = screen.getByRole('button', { name: 'Submit prediction' })

    await user.click(submitButton)
    expect(
      screen.queryByRole('region', { name: 'Attempt history' }),
    ).not.toBeInTheDocument()

    fireEvent.change(answerInput, { target: { value: 'not-a-number' } })
    await user.click(submitButton)
    expect(
      screen.queryByRole('region', { name: 'Attempt history' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a numeric prediction before submitting.',
    )
  })

  it('does not allow advancement before the current exercise is correct', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(
      screen.queryByRole('button', { name: 'Continue to exercise 2' }),
    ).not.toBeInTheDocument()
    await solveCurrentExercise(user, 250)
    expect(
      screen.queryByRole('button', { name: 'Continue to exercise 2' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('DAX-01', { selector: '.exercise-id strong' }),
    ).toBeInTheDocument()
  })

  it('keeps previous exercise attempts visible after advancement', async () => {
    const user = userEvent.setup()
    render(<App />)

    await solveCurrentExercise(user, 450, 2)

    expect(
      screen.getByText('DAX-02', { selector: '.exercise-id strong' }),
    ).toBeInTheDocument()
    const history = screen.getByRole('region', { name: 'Attempt history' })
    expect(within(history).getByRole('listitem')).toHaveTextContent('DAX-01')
  })

  it('restores progress, evidence, and a mapped incorrect attempt after remount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    await solveCurrentExercise(user, 450, 2)
    await solveCurrentExercise(user, 0)
    await waitFor(() =>
      expect(localStorage.getItem(DAX_MISSION_STORAGE_KEY)).not.toBeNull(),
    )

    unmount()
    render(<App />)

    expect(
      screen.getByText('DAX-02', { selector: '.exercise-id strong' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1/12 exercises · 2/8 skills')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Learning World evaluation' }),
    ).toHaveTextContent('0Incorrect')
    expect(
      screen.getByRole('note', { name: 'Possible misconception' }),
    ).toHaveTextContent('M04')
    expect(
      within(
        screen.getByRole('region', { name: 'Attempt history' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(2)
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Mastery demonstrated' }),
    ).not.toBeInTheDocument()
  })

  it('resets persisted completion to a clean DAX-01 causal flow', async () => {
    const user = userEvent.setup()
    const attempts: DaxAttempt[] = daxExercises.map((exercise, index) => ({
      id: `${exercise.id}-attempt-${index + 1}`,
      exerciseId: exercise.id,
      submittedAnswer: exercise.expectedAnswer,
      result: 'correct',
      sequenceNumber: index + 1,
    }))
    persistDaxMissionState(attempts, 'DAX-12')
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Mastery demonstrated' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Why 300?' })).toHaveTextContent(
      'Region filter removedSegment = Retail remains',
    )

    await user.click(screen.getByRole('button', { name: 'Reset mission' }))
    const confirmation = screen.getByRole('alertdialog')
    expect(confirmation).toHaveTextContent(
      'This clears all locally saved attempts and mission progress.',
    )
    await user.click(
      within(confirmation).getByRole('button', { name: 'Confirm reset' }),
    )

    expect(
      screen.getByText('DAX-01', { selector: '.exercise-id strong' }),
    ).toBeInTheDocument()
    expect(screen.getByText('0/12 exercises · 0/8 skills')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Attempt history' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/^Why 450\?$/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'AI Agent intervention' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Commit to a result' })).toBeVisible()
    expect(localStorage.getItem(DAX_MISSION_STORAGE_KEY)).toBeNull()
  })

  it('renders both datasets and the model relationship on DAX-10', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (let index = 0; index < 9; index += 1) {
      await solveCurrentExercise(user, expectedAnswers[index], index + 2)
    }

    expect(
      screen.getByText('DAX-10', { selector: '.exercise-id strong' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: 'Customers data for DAX-10' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: 'Sales data for DAX-10' }),
    ).toBeInTheDocument()
    const relationship = screen.getByRole('region', {
      name: 'DAX model relationship',
    })
    expect(relationship).toHaveTextContent('Customers[CustomerID]')
    expect(relationship).toHaveTextContent('Sales[CustomerID]')
    expect(relationship).toHaveTextContent('Customers → Sales')
  }, 15000)

  it('keeps mastery false with all eight skills demonstrated before transfer', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (let index = 0; index < 11; index += 1) {
      await solveCurrentExercise(
        user,
        expectedAnswers[index],
        index < 10 ? index + 2 : undefined,
      )
    }

    const missionStatus = screen.getByLabelText('Mission status')
    expect(missionStatus).toHaveTextContent('Skills8 / 8')
    expect(missionStatus).toHaveTextContent('TransferPending')
    expect(screen.getByText('11/12 exercises · 8/8 skills')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Mastery demonstrated' }),
    ).not.toBeInTheDocument()
  }, 15000)

  it('completes the mission only after all 12 evaluated learner attempts', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const [index, answer] of expectedAnswers.entries()) {
      await solveCurrentExercise(
        user,
        answer,
        index < expectedAnswers.length - 1 ? index + 2 : undefined,
      )
    }

    expect(
      screen.getByRole('heading', { name: 'Mastery demonstrated' }),
    ).toBeInTheDocument()
    expect(screen.getByText('12/12 exercises · 8/8 skills')).toBeInTheDocument()
    expect(screen.getByLabelText('Mission status')).toHaveTextContent(
      'TransferDemonstrated',
    )
    expect(
      within(
        screen.getByRole('region', { name: 'Attempt history' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(12)
  }, 20000)
})

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
  it('opens as a 70/30 live learning workspace with a primary learner action and passive agent path', () => {
    render(<App />)

    expect(screen.getByText('Learning World')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Course breadcrumb' })).toHaveTextContent(
      'Power BI›DAX›CALCULATE',
    )
    expect(
      screen.getByText('Adaptive assistance. Fixed evidence standard.'),
    ).toBeInTheDocument()

    const workspace = screen.getByRole('region', {
      name: 'Live learning workspace',
    })
    const learnerWorkspace = screen.getByRole('region', {
      name: 'Learning workspace',
    })
    const agentRail = screen.getByRole('complementary', {
      name: 'AI Agent live path',
    })
    const world = screen.getByRole('region', { name: 'Current DAX world' })
    const prediction = screen.getByRole('region', {
      name: 'Commit to a result',
    })
    const globalDetail = screen.getByText('View mission progress')
    expect(workspace).toContainElement(learnerWorkspace)
    expect(workspace).toContainElement(agentRail)
    expect(isBefore(world, prediction)).toBe(true)
    expect(isBefore(prediction, globalDetail)).toBe(true)
    expect(screen.getByRole('button', { name: 'Submit prediction' })).toBeVisible()
    expect(agentRail).toHaveTextContent('Observe● ActiveWaiting for learner attempt')
    expect(agentRail).toHaveTextContent('Context signal○ Waiting')
    expect(agentRail).toHaveTextContent('Select intervention○ Waiting')
    expect(agentRail).toHaveTextContent('Assist○ Waiting')
    expect(agentRail).toHaveTextContent('Current stateLearner action required')
    expect(agentRail).toHaveTextContent('Agent assistance ≠ learning evidence')

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

  it('places compact mapped attempt provenance inside Learning World evaluation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Your numeric answer'), '250')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    const evaluation = screen.getByRole('region', {
      name: 'Learning World evaluation',
    })
    const retry = screen.getByRole('region', {
      name: 'Demonstrate the reasoning again',
    })
    expect(evaluation).toHaveTextContent(
      'Attempt #1 · deterministic evaluationLearner answer250Incorrect',
    )
    expect(
      screen.queryByRole('region', { name: 'Learner attempt' }),
    ).not.toBeInTheDocument()
    expect(isBefore(evaluation, retry)).toBe(true)

    const possibleMisconception = within(evaluation).getByRole('note', {
      name: 'Possible misconception',
    })
    expect(possibleMisconception).toHaveTextContent('M03')
    expect(possibleMisconception).toHaveTextContent(
      'Assumes the targeted filter remains unchanged',
    )
    expect(possibleMisconception).toHaveTextContent(
      'Compatible pattern · not a diagnosis',
    )
    const agentRail = screen.getByRole('complementary', {
      name: 'AI Agent live path',
    })
    expect(agentRail).toHaveTextContent('Attempt #1 · 250 · incorrect')
    expect(agentRail).toHaveTextContent('Possible M03')
    expect(agentRail).toHaveTextContent('Waiting for AI agent')
    expect(agentRail).toHaveTextContent(
      'Live learner state is available through WebMCP.',
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

  it('shows the complete DAX-03 wrong path across the learner workspace and live agent rail', async () => {
    const user = userEvent.setup()
    const priorAttempts: DaxAttempt[] = [
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
        submittedAnswer: 300,
        result: 'correct',
        sequenceNumber: 2,
      },
    ]
    persistDaxMissionState(priorAttempts, 'DAX-03')
    render(<App />)

    await user.type(screen.getByLabelText('Your numeric answer'), '500')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    const evaluation = screen.getByRole('region', {
      name: 'Learning World evaluation',
    })
    const retry = screen.getByRole('region', {
      name: 'Demonstrate the reasoning again',
    })
    const rail = screen.getByRole('complementary', {
      name: 'AI Agent live path',
    })
    expect(evaluation).toHaveTextContent('500Incorrect')
    expect(evaluation).toHaveTextContent('Possible misconception · M02')
    expect(isBefore(evaluation, retry)).toBe(true)
    expect(rail).toHaveTextContent('Attempt #3 · 500 · incorrect')
    expect(rail).toHaveTextContent('Possible M02')
    expect(rail).toHaveTextContent('Select intervention● Active')
    expect(rail).toHaveTextContent('Waiting for AI agent')
    expect(rail).toHaveTextContent('Assist○ Waiting')
    expect(rail).toHaveTextContent(
      'Current stateWaiting for AI agent intervention',
    )
    expect(screen.queryByText(/^Why 300\?$/)).not.toBeInTheDocument()
  })

  it('records the retry, establishes evidence, and immediately reveals a compact five-stage explanation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await solveCurrentExercise(user, 250)
    await solveCurrentExercise(user, 450)

    const history = screen.getByRole('region', { name: 'Attempt history' })
    const attempts = within(history).getAllByRole('listitem')
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toHaveTextContent('Attempt #2DAX-01450Correct')

    const evaluation = screen.getByRole('region', {
      name: 'Learning World evaluation',
    })
    const explanation = screen.getByRole('region', { name: 'Why 450?' })
    expect(evaluation).toHaveTextContent(
      'Attempt #2 · deterministic evaluationLearner answer450Correct',
    )
    expect(evaluation).toHaveTextContent('Evidence establishedS1 · S2')
    expect(
      screen.queryByRole('region', { name: 'Learner attempt' }),
    ).not.toBeInTheDocument()
    expect(isBefore(evaluation, explanation)).toBe(true)
    const agentRail = screen.getByRole('complementary', {
      name: 'AI Agent live path',
    })
    expect(agentRail).toHaveTextContent('Select intervention— Not required')
    expect(agentRail).toHaveTextContent('Assist— Not required')
    expect(agentRail).toHaveTextContent(
      'Evidence established from learner Attempt #2',
    )

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
      screen.getByText('DAX-01', { selector: '.exercise-id span' }),
    ).toBeInTheDocument()
  })

  it('keeps previous exercise attempts visible after advancement', async () => {
    const user = userEvent.setup()
    render(<App />)

    await solveCurrentExercise(user, 450, 2)

    expect(
      screen.getByText('DAX-02', { selector: '.exercise-id span' }),
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
      screen.getByText('DAX-02', { selector: '.exercise-id span' }),
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
      screen.getByText('DAX-01', { selector: '.exercise-id span' }),
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
      screen.getByText('DAX-10', { selector: '.exercise-id span' }),
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

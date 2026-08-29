// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

const expectedAnswers = [450, 300, 300, 250, 250, 150, 50, 250, 500, 450, 200, 300]

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

afterEach(cleanup)

describe('DAX learner attempt flow', () => {
  it('records an incorrect valid prediction as Attempt #1 without revealing the answer', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Your numeric answer'), '250')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    const history = screen.getByRole('region', { name: 'Attempt history' })
    const attempt = within(history).getByRole('listitem')
    expect(attempt).toHaveTextContent('Attempt #1')
    expect(attempt).toHaveTextContent('DAX-01')
    expect(attempt).toHaveTextContent('250')
    expect(attempt).toHaveTextContent('Incorrect')
    expect(screen.getByText('Incorrect prediction')).toBeInTheDocument()
    expect(screen.queryByText('Result')).not.toBeInTheDocument()
    const possibleMisconception = screen.getByRole('note', {
      name: 'Possible misconception',
    })
    expect(possibleMisconception).toHaveTextContent('M03')
    expect(possibleMisconception).toHaveTextContent(
      'Assumes the targeted filter remains unchanged',
    )
    expect(possibleMisconception).toHaveTextContent(
      'This is a reasoning signal, not a diagnosis.',
    )
  })

  it('does not display a possible misconception for an unmapped wrong answer', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Your numeric answer'), '251')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    expect(screen.getByText('Incorrect prediction')).toBeInTheDocument()
    expect(
      screen.queryByRole('note', { name: 'Possible misconception' }),
    ).not.toBeInTheDocument()
  })

  it('records a retry with 450 as Attempt #2 and shows deterministic reasoning', async () => {
    const user = userEvent.setup()
    render(<App />)
    const answerInput = screen.getByLabelText('Your numeric answer')

    await user.type(answerInput, '250')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))
    await user.type(answerInput, '450')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

    const history = screen.getByRole('region', { name: 'Attempt history' })
    const attempts = within(history).getAllByRole('listitem')
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toHaveTextContent('Attempt #2')
    expect(attempts[1]).toHaveTextContent('450')
    expect(attempts[1]).toHaveTextContent('Correct')
    expect(
      screen.getByText('ALL(Sales[Region]) removes the Region filter.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('450', { selector: '.result-line strong' }),
    ).toBeInTheDocument()
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

    await user.type(screen.getByLabelText('Your numeric answer'), '250')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

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

    const transferRemaining = screen.getByText('Transfer challenge remaining')
    expect(transferRemaining.closest('.skill-count')).toHaveTextContent(
      '8 of 8 skills demonstrated',
    )
    expect(screen.getByText('11 of 12 exercises solved')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Mastery demonstrated' }),
    ).not.toBeInTheDocument()
  }, 15000)

  it('completes the 12-exercise mission only after the full evaluated flow', async () => {
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
    expect(screen.getByText('12 of 12 exercises solved')).toBeInTheDocument()

    const evidenceSummary = screen.getByRole('list', {
      name: 'Mastery evidence summary',
    })
    expect(within(evidenceSummary).getAllByRole('listitem')).toHaveLength(8)

    const history = screen.getByRole('region', { name: 'Attempt history' })
    expect(within(history).getAllByRole('listitem')).toHaveLength(12)
  }, 20000)
})

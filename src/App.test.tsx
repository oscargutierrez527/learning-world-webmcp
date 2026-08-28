// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

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
    expect(attempt).toHaveTextContent('250')
    expect(attempt).toHaveTextContent('Incorrect')
    expect(screen.getByText('Incorrect prediction')).toBeInTheDocument()
    expect(screen.queryByText('Result')).not.toBeInTheDocument()
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
      screen.getByText('C2-01', { selector: '.exercise-id strong' }),
    ).toBeInTheDocument()
  })

  it('keeps previous exercise attempts visible after advancement', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Your numeric answer'), '450')
    await user.click(screen.getByRole('button', { name: 'Submit prediction' }))
    await user.click(
      screen.getByRole('button', { name: 'Continue to exercise 2' }),
    )

    expect(
      screen.getByText('C2-02', { selector: '.exercise-id strong' }),
    ).toBeInTheDocument()
    const history = screen.getByRole('region', { name: 'Attempt history' })
    expect(within(history).getByRole('listitem')).toHaveTextContent('C2-01')
  })

  it('does not complete the mission when all skills are shown before transfer', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const [index, answer] of [450, 300, 300].entries()) {
      await user.type(screen.getByLabelText('Your numeric answer'), String(answer))
      await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

      if (index < 2) {
        await user.click(
          screen.getByRole('button', {
            name: `Continue to exercise ${index + 2}`,
          }),
        )
      }
    }

    const transferRemaining = screen.getByText('Transfer challenge remaining')
    expect(transferRemaining.closest('.skill-count')).toHaveTextContent(
      '4 of 4 skills demonstrated',
    )
    expect(
      screen.queryByRole('heading', { name: 'Mastery demonstrated' }),
    ).not.toBeInTheDocument()
  })

  it('completes the four-exercise mission only after the full evaluated flow', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const [index, answer] of [450, 300, 300, 300].entries()) {
      await user.type(screen.getByLabelText('Your numeric answer'), String(answer))
      await user.click(screen.getByRole('button', { name: 'Submit prediction' }))

      if (index < 3) {
        await user.click(
          screen.getByRole('button', {
            name: `Continue to exercise ${index + 2}`,
          }),
        )
      }
    }

    expect(
      screen.getByRole('heading', { name: 'Mastery demonstrated' }),
    ).toBeInTheDocument()
    expect(screen.getByText('4 of 4 exercises solved')).toBeInTheDocument()

    const evidenceSummary = screen.getByRole('list', {
      name: 'Mastery evidence summary',
    })
    expect(within(evidenceSummary).getAllByRole('listitem')).toHaveLength(4)

    const history = screen.getByRole('region', { name: 'Attempt history' })
    expect(within(history).getAllByRole('listitem')).toHaveLength(4)
  })
})

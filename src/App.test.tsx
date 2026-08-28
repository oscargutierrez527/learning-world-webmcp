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
})

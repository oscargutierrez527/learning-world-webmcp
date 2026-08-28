import { type FormEvent, useRef, useState } from 'react'
import './App.css'
import { evaluateDaxPrediction } from './dax/evaluation'
import { calculateFilterContextExercise as exercise } from './dax/exercise'
import type { DaxAttempt } from './dax/types'

function App() {
  const [prediction, setPrediction] = useState('')
  const [attempts, setAttempts] = useState<DaxAttempt[]>([])
  const [validationError, setValidationError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const latestAttempt = attempts.at(-1)
  const exerciseComplete = latestAttempt?.result === 'correct'

  function submitPrediction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const submittedAnswer = Number(prediction)
    if (prediction.trim() === '' || !Number.isFinite(submittedAnswer)) {
      setValidationError('Enter a numeric prediction before submitting.')
      inputRef.current?.focus()
      return
    }

    const sequenceNumber = attempts.length + 1
    const evaluation = evaluateDaxPrediction(exercise, submittedAnswer)
    const attempt: DaxAttempt = {
      id: `${exercise.id}-attempt-${sequenceNumber}`,
      exerciseId: exercise.id,
      submittedAnswer,
      result: evaluation.result,
      sequenceNumber,
    }

    setAttempts((currentAttempts) => [...currentAttempts, attempt])
    setPrediction('')
    setValidationError('')

    if (attempt.result === 'incorrect') {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <main className="learning-shell">
      <header className="mission-header">
        <div>
          <p className="eyebrow">Guided DAX mission</p>
          <h1>DAX CALCULATE &amp; Filter Context</h1>
        </div>
        <div className="exercise-id" aria-label={`Exercise ${exercise.id}`}>
          <span>Exercise</span>
          <strong>{exercise.id}</strong>
        </div>
      </header>

      <section className="exercise-layout" aria-labelledby="challenge-title">
        <div className="source-column">
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <p className="eyebrow">Inspect the context</p>
              <h2 id="challenge-title">Read the data before you predict</h2>
            </div>
          </div>

          <div className="context-grid">
            <div className="data-card">
              <div className="card-label">
                <span>Dataset</span>
                <strong>{exercise.datasetName}</strong>
              </div>
              <table>
                <caption className="sr-only">Sales data for this exercise</caption>
                <thead>
                  <tr>
                    <th scope="col">Region</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {exercise.salesRows.map((row, index) => (
                    <tr key={`${row.region}-${row.amount}-${index}`}>
                      <td>{row.region}</td>
                      <td>{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="filter-card">
              <p className="card-label">Current filter context</p>
              <div className="filter-value">
                <span>{exercise.filterContext.column}</span>
                <span aria-hidden="true">=</span>
                <strong>{exercise.filterContext.value}</strong>
              </div>
              <p className="filter-note">Applied before the measure is evaluated</p>
            </div>
          </div>

          <div className="measure-card">
            <div className="measure-heading">
              <p className="card-label">Measure</p>
              <span>DAX</span>
            </div>
            <pre>
              <code>{exercise.measure}</code>
            </pre>
          </div>
        </div>

        <aside className="prediction-panel" aria-labelledby="prediction-title">
          <div className="section-heading compact">
            <span className="step-number">02</span>
            <div>
              <p className="eyebrow">Make your prediction</p>
              <h2 id="prediction-title">Commit to a result</h2>
            </div>
          </div>

          <p className="question">{exercise.question}</p>

          <form onSubmit={submitPrediction} noValidate>
            <label htmlFor="prediction">Your numeric answer</label>
            <div className="answer-control">
              <input
                ref={inputRef}
                id="prediction"
                name="prediction"
                type="number"
                inputMode="decimal"
                value={prediction}
                onChange={(event) => setPrediction(event.target.value)}
                placeholder="Enter a value"
                aria-describedby={validationError ? 'prediction-error' : undefined}
                aria-invalid={Boolean(validationError)}
                disabled={exerciseComplete}
              />
              <button type="submit" disabled={exerciseComplete}>
                {exerciseComplete ? 'Prediction confirmed' : 'Submit prediction'}
              </button>
            </div>
            {validationError && (
              <p className="validation-message" id="prediction-error" role="alert">
                {validationError}
              </p>
            )}
          </form>

          {latestAttempt?.result === 'incorrect' && (
            <section className="feedback incorrect" aria-live="polite">
              <p className="feedback-kicker">Incorrect prediction</p>
              <h3>Not quite—try the context again.</h3>
              <p>
                Re-check what <code>ALL(Sales[Region])</code> does to the existing
                Region filter inside <code>CALCULATE</code>.
              </p>
            </section>
          )}

          {latestAttempt?.result === 'correct' && (
            <section className="feedback correct" aria-live="polite">
              <p className="feedback-kicker">Correct prediction</p>
              <h3>You followed the filter change.</h3>
              <ol>
                {exercise.reasoningSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="result-line">
                <span>Result</span>
                <strong>{exercise.expectedAnswer}</strong>
              </div>
            </section>
          )}

          {attempts.length > 0 && (
            <section
              className="attempt-history"
              aria-labelledby="attempt-history-title"
            >
              <div className="history-heading">
                <h3 id="attempt-history-title">Attempt history</h3>
                <span>{attempts.length}</span>
              </div>
              <ol>
                {attempts.map((attempt) => (
                  <li key={attempt.id}>
                    <span>Attempt #{attempt.sequenceNumber}</span>
                    <strong>{attempt.submittedAnswer}</strong>
                    <span className={`attempt-result ${attempt.result}`}>
                      {attempt.result === 'correct' ? 'Correct' : 'Incorrect'}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </section>

      <footer>
        <span aria-hidden="true">◆</span>
        Predict first. Learn from the context change.
      </footer>
    </main>
  )
}

export default App

import { type FormEvent, useRef, useState } from 'react'
import './App.css'
import { evaluateDaxPrediction } from './dax/evaluation'
import { daxExercises } from './dax/exercise'
import {
  deriveDaxLearningEvidence,
  getDemonstratedDaxSkillIds,
  isDaxMissionMastered,
  requiredDaxSkills,
} from './dax/learning'
import { identifyDaxMisconception } from './dax/misconceptions'
import type {
  DaxAgentSupport,
  DaxAttempt,
  DaxDataColumn,
  DaxDataRow,
  DaxSupportMode,
} from './dax/types'
import { useDaxWebMcp } from './dax/useDaxWebMcp'

interface DaxDatasetTableProps {
  name: string
  columns: DaxDataColumn[]
  rows: DaxDataRow[]
  exerciseId: string
}

const supportLabels: Record<DaxSupportMode, string> = {
  socratic: 'Socratic',
  explanation: 'Explanation',
  filter_trace: 'Filter trace',
}

function DaxDatasetTable({
  name,
  columns,
  rows,
  exerciseId,
}: DaxDatasetTableProps) {
  return (
    <div className="data-card">
      <div className="card-label">
        <span>Dataset</span>
        <strong>{name}</strong>
      </div>
      <table>
        <caption className="sr-only">
          {name} data for {exerciseId}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${exerciseId}-${name}-row-${rowIndex}`}>
              {columns.map((column) => (
                <td key={column.key}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function App() {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
  const [prediction, setPrediction] = useState('')
  const [attempts, setAttempts] = useState<DaxAttempt[]>([])
  const [agentSupport, setAgentSupport] = useState<DaxAgentSupport | null>(null)
  const [validationError, setValidationError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useDaxWebMcp({ currentExerciseIndex, attempts }, setAgentSupport)

  const exercise = daxExercises[currentExerciseIndex]
  const currentExerciseAttempts = attempts.filter(
    ({ exerciseId }) => exerciseId === exercise.id,
  )
  const latestAttempt = currentExerciseAttempts.at(-1)
  const latestPossibleMisconception = latestAttempt
    ? identifyDaxMisconception(
        exercise,
        latestAttempt.submittedAnswer,
        latestAttempt.result,
      )
    : null
  const exerciseComplete = currentExerciseAttempts.some(
    ({ result }) => result === 'correct',
  )
  const solvedExerciseIds = new Set(
    attempts
      .filter(({ result }) => result === 'correct')
      .map(({ exerciseId }) => exerciseId),
  )
  const evidence = deriveDaxLearningEvidence(attempts)
  const demonstratedSkillIds = getDemonstratedDaxSkillIds(evidence)
  const missionMastered = isDaxMissionMastered(evidence)
  const missionComplete =
    missionMastered && solvedExerciseIds.size === daxExercises.length

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

  function advanceToNextExercise() {
    if (!exerciseComplete || currentExerciseIndex === daxExercises.length - 1) {
      return
    }

    setCurrentExerciseIndex((index) => index + 1)
    setPrediction('')
    setAgentSupport(null)
    setValidationError('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <main className="learning-shell">
      <header className="mission-header">
        <div>
          <p className="eyebrow">Guided DAX mission</p>
          <h1>DAX CALCULATE &amp; Filter Context</h1>
        </div>
        <div className="exercise-id" aria-label={`Exercise ${exercise.id}`}>
          <span>
            Exercise {currentExerciseIndex + 1} of {daxExercises.length}
          </span>
          <strong>{exercise.id}</strong>
        </div>
      </header>

      <section className="mission-overview" aria-label="Mission progress">
        <div className="progress-summary">
          <div>
            <p className="eyebrow">Mission progress</p>
            <strong>
              {solvedExerciseIds.size} of {daxExercises.length} exercises solved
            </strong>
          </div>
          <p className="skill-count">
            <strong>{demonstratedSkillIds.size}</strong> of{' '}
            {requiredDaxSkills.length} skills demonstrated
            {demonstratedSkillIds.size === requiredDaxSkills.length &&
              !missionMastered && <span>Transfer challenge remaining</span>}
          </p>
        </div>

        <ol className="exercise-track" aria-label="Exercise sequence">
          {daxExercises.map((missionExercise, index) => {
            const isCurrent = index === currentExerciseIndex
            const isSolved = solvedExerciseIds.has(missionExercise.id)
            return (
              <li
                key={missionExercise.id}
                className={isCurrent ? 'current' : isSolved ? 'solved' : ''}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span>{isSolved ? '✓' : index + 1}</span>
                <div>
                  <strong>{missionExercise.id}</strong>
                  <small>
                    {isCurrent ? 'Current' : isSolved ? 'Solved' : 'Upcoming'}
                  </small>
                </div>
              </li>
            )
          })}
        </ol>

        <ul className="skill-list" aria-label="Required DAX skills">
          {requiredDaxSkills.map((skill) => {
            const demonstrated = demonstratedSkillIds.has(skill.id)
            return (
              <li key={skill.id} className={demonstrated ? 'demonstrated' : ''}>
                <span>{demonstrated ? '✓' : skill.id}</span>
                <p>
                  <strong>{skill.id}</strong>
                  {skill.name}
                </p>
                <small>{demonstrated ? 'Demonstrated' : 'Not yet'}</small>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="exercise-layout" aria-labelledby="challenge-title">
        <div className="source-column">
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <p className="eyebrow">{exercise.stageLabel}</p>
              <h2 id="challenge-title">Read the data before you predict</h2>
            </div>
          </div>

          <div className="context-grid">
            <DaxDatasetTable
              name={exercise.datasetName}
              columns={exercise.dataColumns}
              rows={exercise.dataRows}
              exerciseId={exercise.id}
            />

            <div className="filter-card">
              <p className="card-label">Current filter context</p>
              <div className="filter-values">
                {exercise.filterContext.map((filter) => (
                  <div className="filter-value" key={filter.column}>
                    <span>{filter.column}</span>
                    <span aria-hidden="true">=</span>
                    <strong>{filter.value}</strong>
                  </div>
                ))}
              </div>
              <p className="filter-note">Applied before the measure is evaluated</p>
            </div>
          </div>

          {exercise.relatedDatasets && exercise.relationship && (
            <section className="model-context" aria-label="DAX model relationship">
              {exercise.relatedDatasets.map((dataset) => (
                <DaxDatasetTable
                  key={dataset.name}
                  name={dataset.name}
                  columns={dataset.columns}
                  rows={dataset.rows}
                  exerciseId={exercise.id}
                />
              ))}
              <div className="relationship-card">
                <p className="card-label">Model relationship</p>
                <div className="relationship-path">
                  <strong>
                    {exercise.relationship.fromTable}[
                    {exercise.relationship.fromColumn}]
                  </strong>
                  <span>
                    {exercise.relationship.fromCardinality === 'one' ? '1' : ''}{' '}
                    →{' '}
                    {exercise.relationship.toCardinality === 'many' ? '*' : ''}
                  </span>
                  <strong>
                    {exercise.relationship.toTable}[
                    {exercise.relationship.toColumn}]
                  </strong>
                </div>
                <p>
                  Single-direction filtering:{' '}
                  <strong>{exercise.relationship.filterDirection}</strong>
                </p>
              </div>
            </section>
          )}

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

          <section
            className={`agent-support ${agentSupport ? 'active' : ''}`}
            aria-label="Agent support"
            aria-live="polite"
          >
            <div className="agent-support-heading">
              <div>
                <p className="feedback-kicker">Contextual assistance</p>
                <h3>Agent support</h3>
              </div>
              {agentSupport && (
                <span className={`support-type ${agentSupport.type}`}>
                  {supportLabels[agentSupport.type]}
                </span>
              )}
            </div>
            {agentSupport ? (
              <div className="agent-support-content">
                {agentSupport.type === 'filter_trace' ? (
                  <div className="filter-trace-content">
                    <div>
                      <strong>Before filters</strong>
                      <ul>
                        {agentSupport.beforeFilters.map((filter) => (
                          <li key={filter}>{filter}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>CALCULATE operation</strong>
                      <code>{agentSupport.operation}</code>
                    </div>
                    {agentSupport.complete ? (
                      <div>
                        <strong>Established trace</strong>
                        <ol>
                          {agentSupport.establishedReasoning?.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                        <p className="trace-result">
                          Established result: <strong>{agentSupport.result}</strong>
                        </p>
                      </div>
                    ) : (
                      <div>
                        <strong>Reasoning focus</strong>
                        <ul>
                          {agentSupport.focus.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p>{agentSupport.text}</p>
                )}
                {agentSupport.possibleMisconception && (
                  <p className="support-misconception">
                    Possible misconception ·{' '}
                    {agentSupport.possibleMisconception.id}
                  </p>
                )}
                <small>
                  {agentSupport.exerciseId} ·{' '}
                  {agentSupport.learnerState.replace('_', ' ')}
                </small>
              </div>
            ) : (
              <p className="agent-support-empty">
                No support has been requested for this exercise.
              </p>
            )}
          </section>

          {latestAttempt?.result === 'incorrect' && (
            <section className="feedback incorrect" aria-live="polite">
              <p className="feedback-kicker">Incorrect prediction</p>
              <h3>Not quite—try the context again.</h3>
              <p>{exercise.incorrectFeedback}</p>
              {latestPossibleMisconception && (
                <div
                  className="possible-misconception"
                  role="note"
                  aria-label="Possible misconception"
                >
                  <span>
                    Possible misconception · {latestPossibleMisconception.id}
                  </span>
                  <strong>{latestPossibleMisconception.label}</strong>
                  <p>
                    This answer is compatible with a known DAX reasoning
                    pattern. This is a reasoning signal, not a diagnosis.
                  </p>
                </div>
              )}
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
              <div className="evidence-earned">
                <span>Evidence recorded</span>
                <strong>{exercise.skillIds.join(' · ')}</strong>
              </div>
              <div className="result-line">
                <span>Result</span>
                <strong>{exercise.expectedAnswer}</strong>
              </div>
            </section>
          )}

          {exerciseComplete && currentExerciseIndex < daxExercises.length - 1 && (
            <button
              type="button"
              className="next-exercise"
              onClick={advanceToNextExercise}
            >
              Continue to exercise {currentExerciseIndex + 2}
              <span aria-hidden="true">→</span>
            </button>
          )}

          {missionComplete && (
            <section
              className="mastery-complete"
              aria-labelledby="mastery-title"
            >
              <p className="feedback-kicker">Mission complete</p>
              <h2 id="mastery-title">Mastery demonstrated</h2>
              <p>
                You demonstrated all required CALCULATE &amp; Filter Context skills
                through evaluated attempts.
              </p>
              <ul aria-label="Mastery evidence summary">
                {requiredDaxSkills.map((skill) => (
                  <li key={skill.id}>
                    <span>✓</span>
                    <p>
                      <strong>{skill.id}</strong>
                      {skill.name}
                    </p>
                  </li>
                ))}
              </ul>
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
                {attempts.map((attempt) => {
                  const attemptExercise = daxExercises.find(
                    ({ id }) => id === attempt.exerciseId,
                  )
                  const possibleMisconception = attemptExercise
                    ? identifyDaxMisconception(
                        attemptExercise,
                        attempt.submittedAnswer,
                        attempt.result,
                      )
                    : null

                  return (
                    <li key={attempt.id}>
                      <span>
                        Attempt #{attempt.sequenceNumber}
                        <small>{attempt.exerciseId}</small>
                        {possibleMisconception && (
                          <small className="attempt-misconception">
                            {possibleMisconception.id} · Possible misconception
                          </small>
                        )}
                      </span>
                      <strong>{attempt.submittedAnswer}</strong>
                      <span className={`attempt-result ${attempt.result}`}>
                        {attempt.result === 'correct' ? 'Correct' : 'Incorrect'}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
        </aside>
      </section>

      <footer>
        <span aria-hidden="true">◆</span>
        Predict first. Mastery comes from evaluated evidence.
      </footer>
    </main>
  )
}

export default App

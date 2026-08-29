import { type FormEvent, useEffect, useRef, useState } from 'react'
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
import {
  clearDaxMissionState,
  persistDaxMissionState,
  restoreDaxMissionState,
} from './dax/persistence'
import type {
  DaxAgentSupport,
  DaxAttempt,
  DaxDataColumn,
  DaxDataRow,
  DaxExercise,
  DaxSupportMode,
} from './dax/types'
import { useDaxWebMcp } from './dax/useDaxWebMcp'

interface DaxDatasetTableProps {
  name: string
  columns: DaxDataColumn[]
  rows: DaxDataRow[]
  exerciseId: string
}

interface DaxAgentSupportEvent {
  support: DaxAgentSupport
  observedAttempt: DaxAttempt | null
}

const supportLabels: Record<DaxSupportMode, string> = {
  socratic: 'Socratic',
  explanation: 'Explanation',
  filter_trace: 'Filter trace',
}

const supportModes: DaxSupportMode[] = [
  'socratic',
  'explanation',
  'filter_trace',
]

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

function DaxSolvedTransformation({ exercise }: { exercise: DaxExercise }) {
  return (
    <section
      className="solved-transformation"
      aria-labelledby="solved-transformation-title"
    >
      <div className="solved-transformation-heading">
        <div>
          <p className="eyebrow">Learning World · Earned explanation</p>
          <h2 id="solved-transformation-title">
            Why {exercise.expectedAnswer}?
          </h2>
        </div>
        <p>Unlocked by the correct evaluated learner attempt above.</p>
      </div>

      <ol className="transformation-stages" aria-label="Earned DAX explanation">
        <article role="listitem" aria-label="Before CALCULATE">
          <span>01</span>
          <div>
            <p className="stage-kicker">Before</p>
            <h3>Before CALCULATE</h3>
            <ul>
              {exercise.filterContext.map(({ column, value }) => (
                <li key={column}>
                  {column} = {value}
                </li>
              ))}
            </ul>
            {exercise.relationship && (
              <p className="relationship-effect">
                {exercise.relationship.filterDirection} propagates this context.
              </p>
            )}
          </div>
        </article>

        <article role="listitem" aria-label="Filter modification">
          <span>02</span>
          <div>
            <p className="stage-kicker">CALCULATE changes the world</p>
            <h3>Filter modification</h3>
            <code>{exercise.filterOperation}</code>
            <p>{exercise.solvedContext.modificationEffect}</p>
          </div>
        </article>

        <article role="listitem" aria-label="After CALCULATE">
          <span>03</span>
          <div>
            <p className="stage-kicker">Modified context</p>
            <h3>After CALCULATE</h3>
            <ul>
              {exercise.solvedContext.afterContext.map((context) => (
                <li key={context}>{context}</li>
              ))}
            </ul>
          </div>
        </article>

        <article role="listitem" aria-label="Visible rows">
          <span>04</span>
          <div>
            <p className="stage-kicker">The measure can now see</p>
            <h3>Visible rows</h3>
            <ul className="visible-row-list">
              {exercise.solvedContext.visibleRows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </div>
        </article>

        <article
          className="transformation-result"
          role="listitem"
          aria-label="Result"
        >
          <span>05</span>
          <div>
            <p className="stage-kicker">SUM evaluates the visible rows</p>
            <h3>Result</h3>
            <strong>{exercise.expectedAnswer}</strong>
          </div>
        </article>
      </ol>

      <div className="deterministic-reasoning">
        <strong>Deterministic reasoning</strong>
        <ol>
          {exercise.reasoningSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function FlowConnector() {
  return (
    <div className="flow-connector" aria-hidden="true">
      <span>↓</span>
    </div>
  )
}

function DaxAttemptEvent({
  attempt,
  retry = false,
}: {
  attempt: DaxAttempt
  retry?: boolean
}) {
  return (
    <section className="flow-event learner-event" aria-label="Learner attempt">
      <div className="flow-event-heading">
        <span className="actor-mark learner-mark" aria-hidden="true">
          L
        </span>
        <div>
          <p className="eyebrow">Learner · {retry ? 'Retry submitted' : 'Prediction submitted'}</p>
          <h2>Authoritative learner attempt</h2>
        </div>
      </div>
      <div className="attempt-lockup">
        <strong>{attempt.submittedAnswer}</strong>
        <p>
          Attempt #{attempt.sequenceNumber}
          <span>{attempt.exerciseId}</span>
        </p>
      </div>
    </section>
  )
}

function DaxEvaluationEvent({
  attempt,
  exercise,
}: {
  attempt: DaxAttempt
  exercise: DaxExercise
}) {
  const possibleMisconception = identifyDaxMisconception(
    exercise,
    attempt.submittedAnswer,
    attempt.result,
  )
  const correct = attempt.result === 'correct'

  return (
    <section
      className={`flow-event world-event ${attempt.result}`}
      aria-label="Learning World evaluation"
      aria-live="polite"
    >
      <div className="flow-event-heading">
        <span className="actor-mark world-mark" aria-hidden="true">
          ◈
        </span>
        <div>
          <p className="eyebrow">Learning World · Deterministic evaluation</p>
          <h2>{correct ? 'Evidence established' : 'Prediction evaluated'}</h2>
        </div>
      </div>

      <div className="evaluation-lockup">
        <strong>{attempt.submittedAnswer}</strong>
        <span>{correct ? 'Correct' : 'Incorrect'}</span>
      </div>

      {correct ? (
        <>
          <p>
            This evaluated learner attempt—not assistance—demonstrated the
            exercise skills.
          </p>
          <div className="evidence-earned">
            <span>Evidence recorded</span>
            <strong>{exercise.skillIds.join(' · ')}</strong>
          </div>
        </>
      ) : (
        <>
          <p className="deterministic-feedback">{exercise.incorrectFeedback}</p>
          {possibleMisconception && (
            <div
              className="possible-misconception"
              role="note"
              aria-label="Possible misconception"
            >
              <span>Possible misconception · {possibleMisconception.id}</span>
              <strong>{possibleMisconception.label}</strong>
              <p>
                This answer is compatible with a known DAX reasoning pattern.
                This is a reasoning signal, not a diagnosis.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function DaxAgentEvent({ event }: { event: DaxAgentSupportEvent }) {
  const { support, observedAttempt } = event

  return (
    <section
      className="flow-event agent-event"
      aria-label="AI Agent intervention"
      aria-live="polite"
    >
      <div className="flow-event-heading">
        <span className="actor-mark agent-mark" aria-hidden="true">
          ✦
        </span>
        <div>
          <p className="eyebrow">AI Agent · via WebMCP</p>
          <h2>{supportLabels[support.type]} intervention</h2>
        </div>
      </div>

      <div className="agent-observation">
        <span>Observed live state</span>
        <strong>{support.exerciseId}</strong>
        <p>
          {observedAttempt
            ? `Attempt #${observedAttempt.sequenceNumber} · ${observedAttempt.submittedAnswer} · ${observedAttempt.result}`
            : 'No learner attempt yet'}
        </p>
        {support.possibleMisconception && (
          <p>Possible {support.possibleMisconception.id}</p>
        )}
      </div>

      <ul className="support-modes" aria-label="Agent assistance capabilities">
        {supportModes.map((mode) => {
          const selected = support.type === mode
          return (
            <li key={mode} className={selected ? 'selected' : ''}>
              <span aria-hidden="true">{selected ? '●' : '○'}</span>
              <strong>{supportLabels[mode]}</strong>
              <small>{selected ? 'Selected by AI Agent' : 'Not selected'}</small>
            </li>
          )
        })}
      </ul>

      <div className="agent-support-content">
        {support.type === 'filter_trace' ? (
          <div className="filter-trace-content">
            <div>
              <strong>Before filters</strong>
              <ul>
                {support.beforeFilters.map((filter) => (
                  <li key={filter}>{filter}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong>CALCULATE operation</strong>
              <code>{support.operation}</code>
            </div>
            {support.complete ? (
              <div>
                <strong>Established trace</strong>
                <ol>
                  {support.establishedReasoning?.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="trace-result">
                  Established result: <strong>{support.result}</strong>
                </p>
              </div>
            ) : (
              <div>
                <strong>Reasoning focus</strong>
                <ul>
                  {support.focus.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="support-copy">{support.text}</p>
        )}
      </div>

      <p className="support-authority">
        Assistance provided · Learning evidence unchanged
      </p>
    </section>
  )
}

function App() {
  const [restoredMissionState] = useState(() => restoreDaxMissionState())
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(
    restoredMissionState.currentExerciseIndex,
  )
  const [prediction, setPrediction] = useState('')
  const [attempts, setAttempts] = useState<DaxAttempt[]>(
    restoredMissionState.attempts,
  )
  const [agentSupportEvent, setAgentSupportEvent] =
    useState<DaxAgentSupportEvent | null>(null)
  const [validationError, setValidationError] = useState('')
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (attempts.length === 0 && currentExerciseIndex === 0) {
      clearDaxMissionState()
      return
    }

    persistDaxMissionState(attempts, daxExercises[currentExerciseIndex].id)
  }, [attempts, currentExerciseIndex])

  const exercise = daxExercises[currentExerciseIndex]
  const currentExerciseAttempts = attempts.filter(
    ({ exerciseId }) => exerciseId === exercise.id,
  )
  const latestAttempt = currentExerciseAttempts.at(-1)
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

  useDaxWebMcp({ currentExerciseIndex, attempts }, (support) => {
    setAgentSupportEvent({
      support,
      observedAttempt: currentExerciseAttempts.at(-1) ?? null,
    })
  })

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
    setAgentSupportEvent(null)
    setValidationError('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function resetMission() {
    clearDaxMissionState()
    setAttempts([])
    setCurrentExerciseIndex(0)
    setPrediction('')
    setAgentSupportEvent(null)
    setValidationError('')
    setResetConfirmationOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const support = agentSupportEvent?.support
  const observedSupportAttempt = agentSupportEvent?.observedAttempt ?? null
  const supportFollowsIncorrectAttempt =
    support?.learnerState === 'incorrect' &&
    observedSupportAttempt?.result === 'incorrect'
  const latestAttemptFollowsSupport = Boolean(
    latestAttempt &&
      observedSupportAttempt &&
      latestAttempt.id !== observedSupportAttempt.id,
  )
  const learnerStatus = exerciseComplete
    ? 'Attempt demonstrated'
    : latestAttempt?.result === 'incorrect'
      ? 'Retry required'
      : 'Prediction required'
  const worldStatus = exerciseComplete
    ? 'Evidence established'
    : latestAttempt?.result === 'incorrect'
      ? 'Incorrect evaluated'
      : 'Awaiting learner attempt'
  const agentStatus = support
    ? `${supportLabels[support.type]} provided`
    : 'Waiting for a WebMCP request'

  const predictionStage = (
    <section
      className={`flow-event prediction-stage ${latestAttempt ? 'retry-stage' : ''}`}
      aria-labelledby="prediction-title"
    >
      <div className="flow-event-heading">
        <span className="actor-mark learner-mark" aria-hidden="true">
          L
        </span>
        <div>
          <p className="eyebrow">
            Learner · {latestAttempt ? 'Retry' : 'Make a prediction'}
          </p>
          <h2 id="prediction-title">
            {latestAttempt ? 'Demonstrate the reasoning again' : 'Commit to a result'}
          </h2>
        </div>
      </div>

      <p className="question">{exercise.question}</p>
      {latestAttempt && (
        <p className="retry-guidance">
          Assistance and feedback can guide you. Only your next evaluated
          prediction can create evidence.
        </p>
      )}

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
          />
          <button type="submit">Submit prediction</button>
        </div>
        {validationError && (
          <p className="validation-message" id="prediction-error" role="alert">
            {validationError}
          </p>
        )}
      </form>
    </section>
  )

  return (
    <main className="learning-shell">
      <header className="mission-header">
        <div className="mission-intro">
          <p className="eyebrow">Guided DAX mission</p>
          <h1>DAX CALCULATE &amp; Filter Context</h1>
          <p className="mission-purpose">
            Predict how CALCULATE changes the context around a measure.
          </p>
          <p className="mission-contract">
            A compatible AI agent can adapt assistance through WebMCP. Only
            evaluated learner attempts create evidence.
          </p>
        </div>
        <div className="mission-actions">
          <div className="mission-counters" aria-label="Mission status">
            <p>
              <span>Exercise</span>
              <strong>
                {currentExerciseIndex + 1} / {daxExercises.length}
              </strong>
            </p>
            <p>
              <span>Skills</span>
              <strong>
                {demonstratedSkillIds.size} / {requiredDaxSkills.length}
              </strong>
            </p>
            <p>
              <span>Transfer</span>
              <strong>{missionMastered ? 'Demonstrated' : 'Pending'}</strong>
            </p>
          </div>
          <div className="exercise-id" aria-label={`Exercise ${exercise.id}`}>
            <span>Current challenge</span>
            <strong>{exercise.id}</strong>
          </div>
          <button
            type="button"
            className="reset-mission"
            onClick={() => setResetConfirmationOpen(true)}
          >
            Reset mission
          </button>
        </div>
      </header>

      {resetConfirmationOpen && (
        <section
          className="reset-confirmation"
          role="alertdialog"
          aria-labelledby="reset-mission-title"
          aria-describedby="reset-mission-description"
        >
          <div>
            <p className="eyebrow">Reset mission</p>
            <h2 id="reset-mission-title">Start again from DAX-01?</h2>
            <p id="reset-mission-description">
              This clears all locally saved attempts and mission progress.
            </p>
          </div>
          <div className="reset-confirmation-actions">
            <button type="button" className="confirm-reset" onClick={resetMission}>
              Confirm reset
            </button>
            <button
              type="button"
              className="cancel-reset"
              onClick={() => setResetConfirmationOpen(false)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="live-actor-strip" aria-label="Live learning actors">
        <div className={!exerciseComplete ? 'next-actor' : 'has-event'}>
          <span className="actor-mark learner-mark" aria-hidden="true">L</span>
          <p><strong>Learner</strong><small>{learnerStatus}</small></p>
        </div>
        <span className="actor-arrow" aria-hidden="true">→</span>
        <div className={latestAttempt ? 'has-event' : ''}>
          <span className="actor-mark world-mark" aria-hidden="true">◈</span>
          <p><strong>Learning World</strong><small>{worldStatus}</small></p>
        </div>
        <span className="actor-arrow" aria-hidden="true">→</span>
        <div className={support ? 'has-event agent-active' : ''}>
          <span className="actor-mark agent-mark" aria-hidden="true">✦</span>
          <p><strong>AI Agent · WebMCP</strong><small>{agentStatus}</small></p>
        </div>
      </section>

      <section className="learning-flow" aria-label="Current learning flow">
        <section
          className="world-context"
          aria-label="Current DAX world"
        >
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <p className="eyebrow">Understand the context · {exercise.stageLabel}</p>
              <h2 id="challenge-title">What world is the measure evaluated in?</h2>
            </div>
          </div>

          <div className="world-data-grid">
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

        </section>

        <FlowConnector />

        {support?.learnerState === 'not_attempted' && agentSupportEvent ? (
          <>
            <DaxAgentEvent event={agentSupportEvent} />
            <FlowConnector />
            {predictionStage}
          </>
        ) : supportFollowsIncorrectAttempt && agentSupportEvent ? (
          <>
            <DaxAttemptEvent attempt={observedSupportAttempt} />
            <FlowConnector />
            <DaxEvaluationEvent
              attempt={observedSupportAttempt}
              exercise={exercise}
            />
            <FlowConnector />
            <DaxAgentEvent event={agentSupportEvent} />

            {latestAttemptFollowsSupport && latestAttempt && (
              <>
                <FlowConnector />
                <DaxAttemptEvent attempt={latestAttempt} retry />
                <FlowConnector />
                <DaxEvaluationEvent attempt={latestAttempt} exercise={exercise} />
              </>
            )}

            {latestAttempt?.result === 'incorrect' && (
              <>
                <FlowConnector />
                {predictionStage}
              </>
            )}
          </>
        ) : latestAttempt ? (
          <>
            <DaxAttemptEvent attempt={latestAttempt} />
            <FlowConnector />
            <DaxEvaluationEvent attempt={latestAttempt} exercise={exercise} />
            {latestAttempt.result === 'incorrect' && (
              <>
                {!agentSupportEvent && (
                  <p className="agent-capability-hint">
                    <span aria-hidden="true">✦</span>
                    <strong>AI Agent · WebMCP</strong>
                    A compatible external agent can observe this evaluated state
                    and choose a bounded intervention when useful.
                  </p>
                )}
                <FlowConnector />
                {predictionStage}
              </>
            )}
          </>
        ) : (
          <>
            {predictionStage}
            <p className="agent-capability-hint">
              <span aria-hidden="true">✦</span>
              <strong>AI Agent · WebMCP</strong>
              A compatible external agent can observe this live state and choose
              an intervention when useful.
            </p>
          </>
        )}

        {exerciseComplete && latestAttempt?.result === 'correct' && (
          <>
            <FlowConnector />
            <DaxSolvedTransformation exercise={exercise} />
          </>
        )}

        {support?.learnerState === 'solved' && agentSupportEvent && (
          <>
            <FlowConnector />
            <DaxAgentEvent event={agentSupportEvent} />
          </>
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
          <section className="mastery-complete" aria-labelledby="mastery-title">
            <p className="eyebrow">Mission complete</p>
            <h2 id="mastery-title">Mastery demonstrated</h2>
            <p>
              All eight required skills and the DAX-12 transfer were
              demonstrated through evaluated learner attempts.
            </p>
            <ul aria-label="Mastery evidence summary">
              {requiredDaxSkills.map((skill) => (
                <li key={skill.id}>
                  <span>✓</span>
                  <p><strong>{skill.id}</strong>{skill.name}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>

      <section className="secondary-information" aria-label="Mission details">
        <details className="mission-progress-details">
          <summary>
            <span>View mission progress</span>
            <small>
              {solvedExerciseIds.size}/{daxExercises.length} exercises ·{' '}
              {demonstratedSkillIds.size}/{requiredDaxSkills.length} skills
            </small>
          </summary>
          <div className="mission-detail-content">
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

            <div className="evidence-overview">
              <div className="evidence-overview-heading">
                <div>
                  <p className="eyebrow">Learning World evidence</p>
                  <h2>Required DAX skills</h2>
                </div>
                <p>Only correct evaluated learner attempts demonstrate skills.</p>
              </div>
              <ul className="skill-list" aria-label="Required DAX skills">
                {requiredDaxSkills.map((skill) => {
                  const demonstrated = demonstratedSkillIds.has(skill.id)
                  return (
                    <li
                      key={skill.id}
                      className={demonstrated ? 'demonstrated' : ''}
                    >
                      <span>{demonstrated ? '✓' : skill.id}</span>
                      <p><strong>{skill.id}</strong>{skill.name}</p>
                      <small>{demonstrated ? 'Demonstrated' : 'Not yet'}</small>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </details>

        {attempts.length > 0 && (
          <section className="attempt-history" aria-labelledby="attempt-history-title">
            <div className="history-heading">
              <div>
                <p className="eyebrow">Secondary record</p>
                <h2 id="attempt-history-title">Attempt history</h2>
              </div>
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
      </section>

      <footer>
        <span aria-hidden="true">◆</span>
        Predict first. Mastery comes from evaluated evidence.
      </footer>
    </main>
  )
}

export default App

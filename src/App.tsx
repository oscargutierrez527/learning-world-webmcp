import { type FormEvent, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  buildDaxCoachSnapshot,
  DAX_ACTIVE_COACH_TIMEOUT_MS,
  executeDaxCoachWebMcp,
  requestDaxCoachSelection,
  type DaxCoachInteraction,
} from './dax/activeCoach'
import type { DaxCoachIntervention } from './dax/activeCoachContract'
import { evaluateDaxPrediction } from './dax/evaluation'
import { daxExercises } from './dax/exercise'
import {
  deriveDaxLearningState,
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
  DaxSkillId,
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
  requestedBy: 'active_coach' | 'external_agent'
}

type AgentStageState =
  | 'completed'
  | 'active'
  | 'waiting'
  | 'not-required'
  | 'unavailable'
  | 'failed'

const agentStageLabels: Record<AgentStageState, string> = {
  completed: '✓ Completed',
  active: '● Active',
  waiting: '○ Waiting',
  'not-required': '— Not required',
  unavailable: '— Unavailable',
  failed: '× Failed',
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
        <p>Unlocked by your correct evaluated attempt.</p>
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
                {exercise.relationship.filterDirection} propagates the context.
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

      <details className="deterministic-reasoning">
        <summary>Review deterministic reasoning</summary>
        <ol>
          {exercise.reasoningSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
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
      className={`loop-event world-event ${attempt.result}`}
      aria-label="Learning World evaluation"
      aria-live="polite"
    >
      <div className="event-actor">
        <span className="actor-mark world-mark" aria-hidden="true">
          ◈
        </span>
        <p>
          <strong>Learning World</strong>
          <small>Attempt #{attempt.sequenceNumber} · deterministic evaluation</small>
        </p>
      </div>

      <div className="evaluation-body">
        <div className="evaluation-lockup">
          <small>Learner answer</small>
          <strong>{attempt.submittedAnswer}</strong>
          <span>{correct ? 'Correct' : 'Incorrect'}</span>
        </div>

        {correct ? (
          <div className="evidence-earned">
            <span>Evidence established</span>
            <strong>{exercise.skillIds.join(' · ')}</strong>
            <small>Created by the learner's evaluated attempt.</small>
          </div>
        ) : (
          <div className="incorrect-guidance">
            <p className="deterministic-feedback">{exercise.incorrectFeedback}</p>
            {possibleMisconception && (
              <div
                className="possible-misconception"
                role="note"
                aria-label="Possible misconception"
              >
                <span>Possible misconception · {possibleMisconception.id}</span>
                <strong>{possibleMisconception.label}</strong>
                <small>Compatible pattern · not a diagnosis</small>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function DaxSupportContent({ support }: { support: DaxAgentSupport }) {
  if (support.type !== 'filter_trace') {
    return <p className="support-copy">{support.text}</p>
  }

  return (
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
  )
}

function DaxDeliveredAssistance({ event }: { event: DaxAgentSupportEvent }) {
  const actor =
    event.requestedBy === 'active_coach'
      ? 'Active Learning Coach'
      : 'AI Agent'

  return (
    <section
      className="loop-event delivered-assistance"
      aria-label="AI Agent intervention"
      aria-live="polite"
    >
      <div className="event-actor">
        <span className="actor-mark agent-mark" aria-hidden="true">
          ✦
        </span>
        <p>
          <strong>{actor} · via WebMCP</strong>
          <small>Selected intervention · {supportLabels[event.support.type]}</small>
        </p>
      </div>
      <div className="delivered-support-body">
        <DaxSupportContent support={event.support} />
        <p className="support-authority">
          Assistance does not create evidence.
        </p>
      </div>
    </section>
  )
}

function AgentTraceStage({
  number,
  label,
  state,
  children,
}: {
  number: string
  label: string
  state: AgentStageState
  children: React.ReactNode
}) {
  return (
    <li
      className={`agent-stage ${state}`}
      aria-current={state === 'active' ? 'step' : undefined}
    >
      <div className="agent-stage-marker" aria-hidden="true">
        <span>{number}</span>
      </div>
      <div className="agent-stage-body">
        <div className="agent-stage-heading">
          <strong>{label}</strong>
          <span>{agentStageLabels[state]}</span>
        </div>
        {children}
      </div>
    </li>
  )
}

function DaxAgentRail({
  exercise,
  latestAttempt,
  supportEvent,
  coachInteraction,
  attemptCount,
  demonstratedSkillCount,
  transferDemonstrated,
  missionMastered,
  missionComplete,
}: {
  exercise: DaxExercise
  latestAttempt: DaxAttempt | undefined
  supportEvent: DaxAgentSupportEvent | null
  coachInteraction: DaxCoachInteraction | null
  attemptCount: number
  demonstratedSkillCount: number
  transferDemonstrated: boolean
  missionMastered: boolean
  missionComplete: boolean
}) {
  const support = supportEvent?.support
  const currentMisconception = latestAttempt
    ? identifyDaxMisconception(
        exercise,
        latestAttempt.submittedAnswer,
        latestAttempt.result,
      )
    : null
  const coachMatchesLatestAttempt = Boolean(
    latestAttempt && coachInteraction?.attemptId === latestAttempt.id,
  )
  const currentCoachInteraction = coachMatchesLatestAttempt
    ? coachInteraction
    : null
  const selectedMode =
    support?.type ?? currentCoachInteraction?.selectedIntervention ?? null
  const selectedByActiveCoach =
    supportEvent?.requestedBy === 'active_coach' ||
    Boolean(currentCoachInteraction?.selectedIntervention)
  const observeState: AgentStageState =
    latestAttempt || support ? 'completed' : 'active'
  const contextState: AgentStageState = latestAttempt
    ? 'completed'
    : support
      ? 'completed'
      : 'waiting'
  const selectionState: AgentStageState =
    latestAttempt?.result === 'correct'
      ? support
        ? 'completed'
        : 'not-required'
      : support
        ? 'completed'
        : currentCoachInteraction?.status === 'selecting'
          ? 'active'
          : currentCoachInteraction?.status === 'coach_unavailable'
            ? 'unavailable'
            : currentCoachInteraction?.selectedIntervention
              ? 'completed'
              : 'waiting'
  const assistState: AgentStageState =
    latestAttempt?.result === 'correct'
      ? support
        ? 'completed'
        : 'not-required'
      : support
        ? 'completed'
        : currentCoachInteraction?.status === 'invoking'
          ? 'active'
          : currentCoachInteraction?.status === 'webmcp_unavailable' ||
              currentCoachInteraction?.status === 'coach_unavailable'
            ? 'unavailable'
            : currentCoachInteraction?.status === 'webmcp_execution_failed'
              ? 'failed'
            : 'waiting'
  const supportObservedDifferentAttempt = Boolean(
    supportEvent?.observedAttempt &&
      latestAttempt &&
      supportEvent.observedAttempt.id !== latestAttempt.id,
  )
  const currentState = missionComplete
    ? 'Mission evidence complete'
    : latestAttempt?.result === 'correct'
      ? `Evidence established from learner Attempt #${latestAttempt.sequenceNumber} · next exercise available`
      : support && latestAttempt?.result === 'incorrect'
        ? `${supportLabels[support.type]} assistance delivered · learner retry required`
        : currentCoachInteraction?.status === 'selecting'
          ? 'Active Learning Coach selecting bounded assistance'
          : currentCoachInteraction?.status === 'invoking' && selectedMode
            ? `Invoking ${supportLabels[selectedMode]} through WebMCP`
            : currentCoachInteraction?.status === 'webmcp_unavailable' && selectedMode
              ? `${supportLabels[selectedMode]} selected · WebMCP unavailable in this browser`
              : currentCoachInteraction?.status === 'webmcp_execution_failed' && selectedMode
                ? `${supportLabels[selectedMode]} selected · WebMCP execution failed`
              : currentCoachInteraction?.status === 'coach_unavailable'
                ? 'Coach unavailable · learner can continue and retry'
        : support
          ? `${supportLabels[support.type]} assistance delivered · learner prediction required`
        : latestAttempt?.result === 'incorrect'
          ? 'Restored attempt ready · coach runs after the next learner retry'
          : 'Learner action required'

  return (
    <aside className="agent-rail" aria-label="AI Agent live path">
      <header className="agent-rail-header">
        <div className="agent-identity">
          <span className="actor-mark agent-mark" aria-hidden="true">
            ✦
          </span>
          <div>
            <p>Active Learning Coach · WebMCP</p>
            <h2>Live assistance path</h2>
          </div>
        </div>
        <span className="live-indicator">Live state</span>
      </header>

      <p className="agent-rail-intro">
        The embedded coach and compatible external agents use the same bounded
        WebMCP capabilities. The learner does not choose the mode.
      </p>

      <ol className="agent-trace" aria-label="Observable agent path">
        <AgentTraceStage number="1" label="Observe" state={observeState}>
          {latestAttempt ? (
            <p>
              <strong>{exercise.id}</strong>
              Attempt #{latestAttempt.sequenceNumber} ·{' '}
              {latestAttempt.submittedAnswer} · {latestAttempt.result}
            </p>
          ) : support ? (
            <p>
              <strong>{exercise.id}</strong>
              Current exercise · no attempt yet
            </p>
          ) : (
            <p>Waiting for learner attempt</p>
          )}
        </AgentTraceStage>

        <AgentTraceStage
          number="2"
          label="Context signal"
          state={contextState}
        >
          {currentMisconception ? (
            <div className="rail-signal">
              <strong>Possible {currentMisconception.id}</strong>
              <p>{currentMisconception.label}</p>
              <small>Compatible pattern · not a diagnosis</small>
            </div>
          ) : latestAttempt ? (
            <p>
              {latestAttempt.result === 'correct'
                ? 'No misconception signal on the correct attempt'
                : 'No mapped signal for this answer'}
            </p>
          ) : support?.possibleMisconception ? (
            <p>Possible {support.possibleMisconception.id}</p>
          ) : support ? (
            <p>Pre-attempt exercise context available</p>
          ) : (
            <p>Waiting for evaluated learner state</p>
          )}
        </AgentTraceStage>

        <AgentTraceStage
          number="3"
          label="Select intervention"
          state={selectionState}
        >
          {selectionState === 'not-required' ? (
            <p>Learner demonstrated the result without assistance.</p>
          ) : selectionState === 'unavailable' ? (
            <div className="agent-unavailable-callout">
              <strong>Coach unavailable</strong>
              <small>Learner can continue and retry.</small>
            </div>
          ) : (
            <>
              {selectionState === 'active' && (
                <div className="agent-waiting-callout">
                  <strong>Active Learning Coach</strong>
                  <small>Selecting bounded assistance...</small>
                </div>
              )}
              {selectionState === 'waiting' && latestAttempt?.result === 'incorrect' && (
                <div className="agent-restored-callout">
                  <strong>Restored learner attempt</strong>
                  <small>Automatic coaching runs only for a new submission.</small>
                </div>
              )}
              <ul className="support-modes" aria-label="Agent assistance capabilities">
                {supportModes.map((mode) => {
                  const selected = selectedMode === mode
                  return (
                    <li key={mode} className={selected ? 'selected' : ''}>
                      <span aria-hidden="true">{selected ? '●' : '○'}</span>
                      <strong>{supportLabels[mode]}</strong>
                    </li>
                  )
                })}
              </ul>
              {selectedMode && (
                <p className="selection-attribution">
                  {selectedByActiveCoach
                    ? 'Selected by Active Learning Coach'
                    : 'Selected by AI Agent · via WebMCP'}
                </p>
              )}
            </>
          )}
        </AgentTraceStage>

        <AgentTraceStage number="4" label="Assist" state={assistState}>
          {support ? (
            <div className="rail-assistance">
              <p>
                <strong>{supportLabels[support.type]}</strong>
                {supportObservedDifferentAttempt &&
                  supportEvent?.observedAttempt &&
                  ` · delivered for Attempt #${supportEvent.observedAttempt.sequenceNumber}`}
              </p>
              <small className="rail-via-webmcp">Via WebMCP</small>
              <DaxSupportContent support={support} />
            </div>
          ) : assistState === 'not-required' ? (
            <p>Exercise solved before any intervention was invoked.</p>
          ) : assistState === 'active' ? (
            <div className="agent-invoking-callout">
              <strong>Invoking selected WebMCP capability...</strong>
              {selectedMode && <small>{supportLabels[selectedMode]}</small>}
            </div>
          ) : assistState === 'unavailable' ? (
            <div className="agent-unavailable-callout">
              <strong>
                {currentCoachInteraction?.status === 'webmcp_unavailable'
                  ? 'WebMCP unavailable in this browser'
                  : 'No assistance was delivered'}
              </strong>
              <small>Learner can continue and retry.</small>
            </div>
          ) : assistState === 'failed' ? (
            <div className="agent-unavailable-callout">
              <strong>WebMCP execution failed</strong>
              <small>The learner can continue and retry.</small>
            </div>
          ) : (
            <p>Waiting for an agent capability invocation</p>
          )}
        </AgentTraceStage>
      </ol>

      <section
        className="rail-current-state"
        aria-label="Current agent state"
        aria-live="polite"
      >
        <span>Current state</span>
        <strong>{currentState}</strong>
      </section>

      <section className="impact-summary" aria-label="Learning impact summary">
        <div className="impact-heading">
          <span>Authoritative learning state</span>
          <small>Derived live</small>
        </div>
        <dl>
          <div>
            <dt>Learner attempts</dt>
            <dd>{attemptCount}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>{demonstratedSkillCount} / {requiredDaxSkills.length} skills</dd>
          </div>
          <div>
            <dt>Transfer</dt>
            <dd>{transferDemonstrated ? 'Demonstrated' : 'Pending'}</dd>
          </div>
          <div>
            <dt>Mastery</dt>
            <dd>{missionMastered ? 'Demonstrated' : 'Pending'}</dd>
          </div>
        </dl>
        {latestAttempt?.result === 'correct' && (
          <p className="latest-evidence">
            Latest evidence · {exercise.skillIds.join(' · ')} · learner Attempt #{latestAttempt.sequenceNumber}
          </p>
        )}
        {support && (
          <p className="assistance-impact">
            Assistance impact · attempts unchanged · evidence unchanged · mastery unchanged.
          </p>
        )}
      </section>

      <p className="rail-authority">
        Agent assistance ≠ learning evidence
      </p>
    </aside>
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
  const [coachInteraction, setCoachInteraction] =
    useState<DaxCoachInteraction | null>(null)
  const [validationError, setValidationError] = useState('')
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const attemptsRef = useRef(restoredMissionState.attempts)
  const currentExerciseIndexRef = useRef(
    restoredMissionState.currentExerciseIndex,
  )
  const processedCoachAttemptIdsRef = useRef(new Set<string>())
  const priorCoachInterventionsRef = useRef(
    new Map<string, DaxCoachIntervention[]>(),
  )
  const activeCoachControllerRef = useRef<AbortController | null>(null)
  const activeCoachAttemptIdRef = useRef<string | null>(null)
  const coachToolAttemptIdRef = useRef<string | null>(null)

  useEffect(() => {
    attemptsRef.current = attempts
  }, [attempts])

  useEffect(() => {
    currentExerciseIndexRef.current = currentExerciseIndex
  }, [currentExerciseIndex])

  useEffect(
    () => () => {
      activeCoachControllerRef.current?.abort()
    },
    [],
  )

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
  const learningState = deriveDaxLearningState(attempts)
  const {
    solvedExerciseIds,
    demonstratedSkillIds,
    transferDemonstrated,
    missionMastered,
    missionComplete,
  } = learningState

  useDaxWebMcp({ currentExerciseIndex, attempts }, (support) => {
    const activeExercise = daxExercises[currentExerciseIndexRef.current]
    if (!activeExercise || support.exerciseId !== activeExercise.id) {
      return
    }
    const coachAttemptId = coachToolAttemptIdRef.current
    const observedAttempt = coachAttemptId
      ? attemptsRef.current.find(({ id }) => id === coachAttemptId) ?? null
      : attemptsRef.current
          .filter(({ exerciseId }) => exerciseId === activeExercise.id)
          .at(-1) ?? null
    setAgentSupportEvent({
      support,
      observedAttempt,
      requestedBy: coachAttemptId ? 'active_coach' : 'external_agent',
    })
  })

  function cancelActiveCoachRun() {
    activeCoachControllerRef.current?.abort()
    activeCoachControllerRef.current = null
    activeCoachAttemptIdRef.current = null
    coachToolAttemptIdRef.current = null
  }

  function focusCurrentExercise() {
    requestAnimationFrame(() => {
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      inputRef.current?.focus({ preventScroll: true })
    })
  }

  async function startActiveCoach(
    attempt: DaxAttempt,
    nextAttempts: DaxAttempt[],
    activeExercise: DaxExercise,
    skillIds: Set<DaxSkillId>,
  ) {
    if (processedCoachAttemptIdsRef.current.has(attempt.id)) {
      return
    }
    processedCoachAttemptIdsRef.current.add(attempt.id)

    cancelActiveCoachRun()
    const controller = new AbortController()
    activeCoachControllerRef.current = controller
    activeCoachAttemptIdRef.current = attempt.id
    setAgentSupportEvent(null)
    setCoachInteraction({
      attemptId: attempt.id,
      attemptSequenceNumber: attempt.sequenceNumber,
      status: 'selecting',
      selectedIntervention: null,
    })

    const snapshot = buildDaxCoachSnapshot({
      exercise: activeExercise,
      currentAttempt: attempt,
      attempts: nextAttempts,
      demonstratedSkillIds: skillIds,
      priorInterventions:
        priorCoachInterventionsRef.current.get(activeExercise.id) ?? [],
    })
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, DAX_ACTIVE_COACH_TIMEOUT_MS)

    try {
      const selection = await requestDaxCoachSelection(
        snapshot,
        controller.signal,
      )
      if (activeCoachAttemptIdRef.current !== attempt.id) {
        return
      }

      setCoachInteraction({
        attemptId: attempt.id,
        attemptSequenceNumber: attempt.sequenceNumber,
        status: 'invoking',
        selectedIntervention: selection.intervention,
      })
      coachToolAttemptIdRef.current = attempt.id

      let execution: 'executed' | 'unavailable' | 'execution_failed'
      try {
        execution = await executeDaxCoachWebMcp(
          selection.intervention,
          activeExercise.id,
          controller.signal,
        )
      } catch (error) {
        if (controller.signal.aborted) {
          throw error
        }
        execution = 'execution_failed'
      }

      if (activeCoachAttemptIdRef.current !== attempt.id) {
        return
      }

      if (execution === 'unavailable') {
        setCoachInteraction({
          attemptId: attempt.id,
          attemptSequenceNumber: attempt.sequenceNumber,
          status: 'webmcp_unavailable',
          selectedIntervention: selection.intervention,
        })
        return
      }

      if (execution === 'execution_failed') {
        setCoachInteraction({
          attemptId: attempt.id,
          attemptSequenceNumber: attempt.sequenceNumber,
          status: 'webmcp_execution_failed',
          selectedIntervention: selection.intervention,
        })
        return
      }

      const interventionHistory =
        priorCoachInterventionsRef.current.get(activeExercise.id) ?? []
      priorCoachInterventionsRef.current.set(activeExercise.id, [
        ...interventionHistory,
        selection.intervention,
      ].slice(-4))
      setCoachInteraction({
        attemptId: attempt.id,
        attemptSequenceNumber: attempt.sequenceNumber,
        status: 'delivered',
        selectedIntervention: selection.intervention,
      })
    } catch {
      if (
        activeCoachAttemptIdRef.current !== attempt.id ||
        (controller.signal.aborted && !timedOut)
      ) {
        return
      }

      setCoachInteraction({
        attemptId: attempt.id,
        attemptSequenceNumber: attempt.sequenceNumber,
        status: 'coach_unavailable',
        selectedIntervention: null,
      })
    } finally {
      window.clearTimeout(timeout)
      if (activeCoachAttemptIdRef.current === attempt.id) {
        activeCoachControllerRef.current = null
        coachToolAttemptIdRef.current = null
      }
    }
  }

  function submitPrediction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const submittedAnswer = Number(prediction)
    if (prediction.trim() === '' || !Number.isFinite(submittedAnswer)) {
      setValidationError('Enter a numeric prediction before submitting.')
      inputRef.current?.focus()
      return
    }

    const sequenceNumber = attemptsRef.current.length + 1
    const evaluation = evaluateDaxPrediction(exercise, submittedAnswer)
    const attempt: DaxAttempt = {
      id: `${exercise.id}-attempt-${sequenceNumber}`,
      exerciseId: exercise.id,
      submittedAnswer,
      result: evaluation.result,
      sequenceNumber,
    }

    const nextAttempts = [...attemptsRef.current, attempt]
    attemptsRef.current = nextAttempts
    setAttempts(nextAttempts)
    setPrediction('')
    setValidationError('')

    if (attempt.result === 'incorrect') {
      const nextLearningState = deriveDaxLearningState(nextAttempts)
      void startActiveCoach(
        attempt,
        nextAttempts,
        exercise,
        nextLearningState.demonstratedSkillIds,
      )
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      cancelActiveCoachRun()
    }
  }

  function advanceToNextExercise() {
    if (!exerciseComplete || currentExerciseIndex === daxExercises.length - 1) {
      return
    }

    const nextExerciseIndex = currentExerciseIndex + 1
    currentExerciseIndexRef.current = nextExerciseIndex
    setCurrentExerciseIndex(nextExerciseIndex)
    setPrediction('')
    setAgentSupportEvent(null)
    setCoachInteraction(null)
    cancelActiveCoachRun()
    setValidationError('')
    focusCurrentExercise()
  }

  function resetMission() {
    clearDaxMissionState()
    cancelActiveCoachRun()
    attemptsRef.current = []
    currentExerciseIndexRef.current = 0
    processedCoachAttemptIdsRef.current.clear()
    priorCoachInterventionsRef.current.clear()
    setAttempts([])
    setCurrentExerciseIndex(0)
    setPrediction('')
    setAgentSupportEvent(null)
    setCoachInteraction(null)
    setValidationError('')
    setResetConfirmationOpen(false)
    focusCurrentExercise()
  }

  const support = agentSupportEvent?.support
  const observedSupportAttempt = agentSupportEvent?.observedAttempt ?? null
  const supportMatchesLatestAttempt = Boolean(
    support &&
      latestAttempt &&
      observedSupportAttempt?.id === latestAttempt.id,
  )

  const predictionStage = (
    <section
      className={`prediction-stage ${latestAttempt ? 'retry-stage' : ''}`}
      aria-labelledby="prediction-title"
    >
      <div className="prediction-heading">
        <div className="event-actor">
          <span className="actor-mark learner-mark" aria-hidden="true">
            L
          </span>
          <p>
            <strong>Learner · {latestAttempt ? 'Your retry' : 'Your prediction'}</strong>
            <small>Your response creates learning evidence.</small>
          </p>
        </div>
        <h2 id="prediction-title">
          {latestAttempt ? 'Demonstrate the reasoning again' : 'Commit to a result'}
        </h2>
      </div>

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
      <header className="product-header">
        <div className="brand-block">
          <p className="brand-name">Learning World</p>
          <nav aria-label="Course breadcrumb">
            <span>Power BI</span>
            <span aria-hidden="true">›</span>
            <span>DAX</span>
            <span aria-hidden="true">›</span>
            <strong>CALCULATE</strong>
          </nav>
          <h1>DAX CALCULATE &amp; Filter Context</h1>
          <p>Adaptive assistance. Fixed evidence standard.</p>
        </div>

        <div className="header-actions">
          <div className="mission-counters" aria-label="Mission status">
            <p>
              <span>Exercise</span>
              <strong>{currentExerciseIndex + 1} / {daxExercises.length}</strong>
            </p>
            <p>
              <span>Skills</span>
              <strong>
                {learningState.demonstratedSkillCount} / {requiredDaxSkills.length}
              </strong>
            </p>
            <p>
              <span>Transfer</span>
              <strong>{transferDemonstrated ? 'Demonstrated' : 'Pending'}</strong>
            </p>
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
        <div className="reset-backdrop">
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
        </div>
      )}

      <section className="workspace-layout" aria-label="Live learning workspace">
        <section className="learner-workspace" aria-label="Learning workspace">
          <header className="challenge-header">
            <div className="exercise-id" aria-label={`Exercise ${exercise.id}`}>
              <span>{exercise.id}</span>
              <small>Current challenge</small>
            </div>
            <div>
              <p className="eyebrow">{exercise.stageLabel}</p>
              <h2>{exercise.question}</h2>
            </div>
            <div className="learner-authority">
              <span aria-hidden="true">L → ◈</span>
              <p>Learner predicts · Learning World evaluates</p>
            </div>
          </header>

          <section className="world-context" aria-label="Current DAX world">
            <div className="context-heading">
              <p>
                <span aria-hidden="true">◆</span>
                Current DAX world
              </p>
              <small>Read the context before predicting.</small>
            </div>
            <div className="world-data-grid">
              <DaxDatasetTable
                name={exercise.datasetName}
                columns={exercise.dataColumns}
                rows={exercise.dataRows}
                exerciseId={exercise.id}
              />

              <div className="filter-card">
                <p className="card-label">Active filters</p>
                <div className="filter-values">
                  {exercise.filterContext.map((filter) => (
                    <div className="filter-value" key={filter.column}>
                      <span>{filter.column}</span>
                      <span aria-hidden="true">=</span>
                      <strong>{filter.value}</strong>
                    </div>
                  ))}
                </div>
                <small>Active before CALCULATE</small>
              </div>

              <div className="measure-card">
                <div className="measure-heading">
                  <p className="card-label">DAX measure</p>
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

          <section className="learning-loop" aria-label="Current learning flow">
            {!latestAttempt && support && agentSupportEvent && (
              <DaxDeliveredAssistance event={agentSupportEvent} />
            )}

            {!latestAttempt && predictionStage}

            {latestAttempt && (
              <DaxEvaluationEvent attempt={latestAttempt} exercise={exercise} />
            )}

            {latestAttempt?.result === 'incorrect' &&
              supportMatchesLatestAttempt &&
              agentSupportEvent && (
                <DaxDeliveredAssistance event={agentSupportEvent} />
              )}

            {latestAttempt?.result === 'incorrect' && !supportMatchesLatestAttempt && (
              <p className="agent-capability-hint">
                <span aria-hidden="true">✦</span>
                <strong>Active Learning Coach · WebMCP</strong>
                {coachInteraction?.attemptId === latestAttempt.id &&
                coachInteraction.status === 'selecting'
                  ? 'Selecting bounded assistance from the evaluated learner state.'
                  : coachInteraction?.attemptId === latestAttempt.id &&
                      coachInteraction.status === 'invoking'
                    ? `Invoking ${supportLabels[coachInteraction.selectedIntervention!]} through WebMCP.`
                    : coachInteraction?.attemptId === latestAttempt.id &&
                      coachInteraction.status === 'webmcp_unavailable'
                      ? `${supportLabels[coachInteraction.selectedIntervention!]} was selected, but WebMCP is unavailable in this browser.`
                      : coachInteraction?.attemptId === latestAttempt.id &&
                          coachInteraction.status === 'webmcp_execution_failed'
                        ? `${supportLabels[coachInteraction.selectedIntervention!]} was selected, but WebMCP execution failed. You can continue and retry.`
                      : coachInteraction?.attemptId === latestAttempt.id &&
                          coachInteraction.status === 'coach_unavailable'
                        ? 'Coach unavailable. You can continue and retry.'
                        : 'This restored attempt remains observable. A new incorrect submission can activate the coach.'}
              </p>
            )}

            {latestAttempt?.result === 'incorrect' && predictionStage}

            {exerciseComplete && latestAttempt?.result === 'correct' && (
              <DaxSolvedTransformation exercise={exercise} />
            )}

            {exerciseComplete &&
              support?.learnerState === 'solved' &&
              agentSupportEvent && (
                <DaxDeliveredAssistance event={agentSupportEvent} />
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
              </section>
            )}
          </section>
        </section>

        <DaxAgentRail
          exercise={exercise}
          latestAttempt={latestAttempt}
          supportEvent={agentSupportEvent}
          coachInteraction={coachInteraction}
          attemptCount={learningState.attemptCount}
          demonstratedSkillCount={learningState.demonstratedSkillCount}
          transferDemonstrated={transferDemonstrated}
          missionMastered={missionMastered}
          missionComplete={missionComplete}
        />
      </section>

      <section className="secondary-information" aria-label="Mission details">
        <details className="mission-progress-details">
          <summary>
            <span>View mission progress</span>
            <small>
              {learningState.solvedExerciseCount}/{daxExercises.length} exercises ·{' '}
              {learningState.demonstratedSkillCount}/{requiredDaxSkills.length} skills
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
                      <p>
                        <strong>{skill.id}</strong>
                        {skill.name}
                      </p>
                      <small>{demonstrated ? 'Demonstrated' : 'Not yet'}</small>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </details>

        {learningState.attemptCount > 0 && (
          <details className="attempt-history-details">
            <summary>
              <span>Attempt history</span>
              <small>{learningState.attemptCount} recorded</small>
            </summary>
            <section
              className="attempt-history"
              aria-labelledby="attempt-history-title"
            >
              <h2 className="sr-only" id="attempt-history-title">Attempt history</h2>
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
          </details>
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

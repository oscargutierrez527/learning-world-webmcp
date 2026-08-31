import { daxExercises } from './exercise'
import type {
  DaxAttempt,
  DaxLearningEvidence,
  DaxSkill,
  DaxSkillId,
} from './types'

export const requiredDaxSkills: DaxSkill[] = [
  { id: 'S1', name: 'Read active filter context' },
  { id: 'S2', name: 'Understand removal of a column filter' },
  {
    id: 'S3',
    name: 'Understand replacement of an existing same-column filter',
  },
  {
    id: 'S4',
    name: 'Understand preservation of unrelated filters',
  },
  { id: 'S5', name: 'Understand adding/combining CALCULATE filters' },
  { id: 'S6', name: 'Understand KEEPFILTERS intersection behavior' },
  { id: 'S7', name: 'Understand filter-removal scope: column vs table' },
  {
    id: 'S8',
    name: 'Trace filter propagation through a model relationship',
  },
]

export interface DaxLearningState {
  attemptCount: number
  evidence: DaxLearningEvidence[]
  solvedExerciseIds: Set<string>
  solvedExerciseCount: number
  demonstratedSkillIds: Set<DaxSkillId>
  demonstratedSkillCount: number
  transferDemonstrated: boolean
  missionMastered: boolean
  missionComplete: boolean
}

export function deriveDaxLearningEvidence(
  attempts: DaxAttempt[],
): DaxLearningEvidence[] {
  return attempts.flatMap((attempt) => {
    if (attempt.result !== 'correct') {
      return []
    }

    const exercise = daxExercises.find(({ id }) => id === attempt.exerciseId)
    if (!exercise) {
      return []
    }

    return exercise.skillIds.map((skillId) => ({
      id: `${attempt.id}-${skillId}`,
      skillId,
      exerciseId: exercise.id,
      attemptId: attempt.id,
    }))
  })
}

export function getDemonstratedDaxSkillIds(
  evidence: DaxLearningEvidence[],
): Set<DaxSkillId> {
  return new Set(evidence.map(({ skillId }) => skillId))
}

export function isDaxMissionMastered(
  evidence: DaxLearningEvidence[],
): boolean {
  const demonstratedSkillIds = getDemonstratedDaxSkillIds(evidence)
  const allRequiredSkillsDemonstrated = requiredDaxSkills.every(({ id }) =>
    demonstratedSkillIds.has(id),
  )
  const transferDemonstrated = evidence.some(
    ({ exerciseId }) => exerciseId === 'DAX-12',
  )

  return allRequiredSkillsDemonstrated && transferDemonstrated
}

export function deriveDaxLearningState(
  attempts: DaxAttempt[],
): DaxLearningState {
  const evidence = deriveDaxLearningEvidence(attempts)
  const solvedExerciseIds = new Set(
    attempts
      .filter(({ result }) => result === 'correct')
      .map(({ exerciseId }) => exerciseId),
  )
  const demonstratedSkillIds = getDemonstratedDaxSkillIds(evidence)
  const transferDemonstrated = evidence.some(
    ({ exerciseId }) => exerciseId === 'DAX-12',
  )
  const missionMastered = isDaxMissionMastered(evidence)

  return {
    attemptCount: attempts.length,
    evidence,
    solvedExerciseIds,
    solvedExerciseCount: solvedExerciseIds.size,
    demonstratedSkillIds,
    demonstratedSkillCount: demonstratedSkillIds.size,
    transferDemonstrated,
    missionMastered,
    missionComplete:
      missionMastered && solvedExerciseIds.size === daxExercises.length,
  }
}

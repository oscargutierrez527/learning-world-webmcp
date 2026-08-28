import { daxExercises } from './exercise'
import type {
  DaxAttempt,
  DaxLearningEvidence,
  DaxSkill,
  DaxSkillId,
} from './types'

export const requiredDaxSkills: DaxSkill[] = [
  { id: 'S1', name: 'Read existing filter context' },
  { id: 'S2', name: 'Understand ALL removing a column filter' },
  {
    id: 'S3',
    name: 'Understand CALCULATE replacing a same-column filter',
  },
  {
    id: 'S4',
    name: 'Understand unrelated filters remain after one filter is removed',
  },
]

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
    ({ exerciseId }) => exerciseId === 'C2-04',
  )

  return allRequiredSkillsDemonstrated && transferDemonstrated
}

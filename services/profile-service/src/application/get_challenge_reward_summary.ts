import { ChallengeRepository } from '../ports/repositories';

/** Lectura exclusiva de recompensas concedidas: no crea perfiles, progreso ni avisos. */
export const makeGetChallengeRewardSummary = (deps: {
  challenges: Pick<ChallengeRepository, 'rewardTotal'>;
}) => async (userId: string) => {
  const totalPoints = await deps.challenges.rewardTotal(userId);
  if (!Number.isSafeInteger(totalPoints) || totalPoints < 0) {
    throw new Error('Invalid persisted challenge reward total');
  }
  return { success: true, data: { totalPoints } };
};

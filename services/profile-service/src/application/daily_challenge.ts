import { updateChallengeRewardAchievements } from './challenge_reward_achievements';
import { TranslationProduced } from '@traduce/shared';
import { bogotaDate, challengeText, initialChallenge, selectChallenge } from '../domain/challenge';
import { DEFAULT_PREFERENCES, Preferences } from '../domain/preferences';
import { TransactionalRepositories, UnitOfWork } from '../ports/repositories';

const titles = {
  ES: 'Reto completado', EN: 'Challenge completed', FR: 'Défi terminé', PT: 'Desafio concluído',
};

/** Comparte transacción, bloqueo y recibo de traducción con los logros. */
export const advanceDailyChallenge = async (
  repositories: TransactionalRepositories, userId: string, event: TranslationProduced, preferences: Preferences,
) => {
  const date = bogotaDate(new Date(event.occurredAt));
  let challenge = await repositories.challenges.findAssignment(userId, date);
  if (challenge?.completed) return;
  if (!challenge) {
    const definition = selectChallenge(await repositories.challenges.listActive(), date);
    if (!definition) return;
    challenge = await repositories.challenges.save(userId, initialChallenge(definition, date));
  }
  const currentCount = Math.min(challenge.targetCount, challenge.currentCount + 1);
  const completed = currentCount === challenge.targetCount;
  const updated = await repositories.challenges.save(userId, {
    ...challenge, currentCount, completed, completedAt: completed ? new Date(event.occurredAt).toISOString() : null,
  });
  if (!completed) return;
  // La recompensa existe aunque el usuario haya desactivado los avisos.
  const granted = await repositories.challenges.grantReward(userId, updated);
  if (granted && preferences.notificationsEnabled) {
    const text = challengeText(updated, preferences.uiLanguage);
    await repositories.notifications.create({
      userId, typeCode: 'CHALLENGE_COMPLETED', title: `${titles[preferences.uiLanguage]}: ${text.name}`,
      body: text.description, referenceType: 'CHALLENGE', referenceId: updated.assignmentId,
    });
  }
  return granted ? updateChallengeRewardAchievements(repositories, userId, preferences) : [];
};

export const makeGetTodayChallenge = (deps: { unitOfWork: UnitOfWork; now?: () => Date }) =>
  async (userId: string) => deps.unitOfWork.run(async repositories => {
    // No crea perfiles ni asignaciones. El bloqueo coordina la lectura con eraseUser.
    await repositories.gamificationLocks.lockUser(userId);
    if (await repositories.profiles.isErased(userId)) {
      return { success: true, data: null, message: 'Cuenta eliminada' };
    }
    const date = bogotaDate((deps.now ?? (() => new Date()))());
    const existing = await repositories.challenges.findAssignment(userId, date);
    const definition = existing ?? selectChallenge(await repositories.challenges.listActive(), date);
    if (!definition) return { success: true, data: null, message: 'No hay retos activos para hoy' };
    const challenge = existing ?? initialChallenge(definition, date);
    const preferences = await repositories.profiles.findPreferences(userId) ?? DEFAULT_PREFERENCES;
    const text = challengeText(challenge, preferences.uiLanguage);
    return { success: true, data: {
      assignmentId: existing?.assignmentId ?? null,
      reward: existing ? await repositories.challenges.findReward(userId, existing.assignmentId) : null,
      localizations: challenge.localizations,
      challengeId: challenge.challengeId, code: challenge.code, ...text,
      targetCount: challenge.targetCount, currentCount: challenge.currentCount, points: challenge.points,
      completed: challenge.completed, completedAt: challenge.completedAt, date: challenge.date,
    } };
  });

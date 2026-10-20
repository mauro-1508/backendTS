import { Achievement } from '../domain/achievement';
import { UiLanguage } from '../domain/preferences';

const titles: Record<UiLanguage, (name: string) => string> = {
  ES: name => `Logro desbloqueado: ${name}`,
  EN: name => `Achievement unlocked: ${name}`,
  FR: name => `Succès débloqué : ${name}`,
  PT: name => `Conquista desbloqueada: ${name}`,
};

/** Keep the existing title/body contract; use the persisted language at unlock time. */
export const achievementNotificationText = (achievement: Achievement, language: UiLanguage) => {
  const text = achievement.localizations?.[language.toLowerCase()]
    ?? achievement.localizations?.es ?? achievement;
  return { title: titles[language](text.name), body: text.description };
};

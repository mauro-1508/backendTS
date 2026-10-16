import { EventPublisher } from '@traduce/shared';
import { accountDeletedError, notFoundError, validationError } from '../domain/errors';
import { PUBLISHED_EVENTS } from '../domain/events';
import {
  DEFAULT_PREFERENCES, Preferences, PreferencesPatch, THEMES, UI_LANGUAGES,
} from '../domain/preferences';
import { ProfileRepository, UnitOfWork } from '../ports/repositories';
import { publishQuietly } from './publish_event';

const isOneOf = <T extends string>(allowed: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value);

/** Valida el cuerpo del PATCH y devuelve solo los campos permitidos. */
export const parsePreferencesPatch = (body: unknown): PreferencesPatch => {
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: PreferencesPatch = {};

  if (input.uiLanguage !== undefined) {
    if (!isOneOf(UI_LANGUAGES, input.uiLanguage)) throw validationError(`uiLanguage debe ser ${UI_LANGUAGES.join(' o ')}`);
    patch.uiLanguage = input.uiLanguage;
  }
  if (input.theme !== undefined) {
    if (!isOneOf(THEMES, input.theme)) throw validationError(`theme debe ser ${THEMES.join(' o ')}`);
    patch.theme = input.theme;
  }
  if (input.notificationsEnabled !== undefined) {
    if (typeof input.notificationsEnabled !== 'boolean') throw validationError('notificationsEnabled debe ser booleano');
    patch.notificationsEnabled = input.notificationsEnabled;
  }
  if (Object.keys(patch).length === 0) throw validationError('No se envió ningún campo para actualizar');
  return patch;
};

export const makeGetPreferences = (deps: { profiles: ProfileRepository }) =>
  async (userId: string): Promise<Preferences> =>
    (await deps.profiles.findPreferences(userId)) ?? DEFAULT_PREFERENCES;

export const makeUpdatePreferences = (deps: {
  unitOfWork: UnitOfWork;
  eventPublisher: EventPublisher;
}) =>
  async (userId: string, body: unknown): Promise<Preferences> => {
    const patch = parsePreferencesPatch(body);

    const updated = await deps.unitOfWork.run(async repositories => {
      // Coordina el guardado y la reparación de preferencias con el borrado.
      await repositories.gamificationLocks.lockUser(userId);

      // No permite guardar preferencias de una cuenta ya eliminada.
      if (await repositories.profiles.isErased(userId)) {
        throw accountDeletedError();
      }

      const preferences = await repositories.profiles.updatePreferences(
        userId,
        patch,
      );

      if (!preferences) {
        throw notFoundError('Perfil no encontrado');
      }

      return preferences;
    });

    // Publica el aviso después de confirmar el guardado.
    await publishQuietly(
      deps.eventPublisher,
      PUBLISHED_EVENTS.PreferencesChanged,
      { userId, ...patch },
    );

    return updated;
  };

import { EventPublisher } from '@traduce/shared';
import { notFoundError, validationError } from '../domain/errors';
import { PUBLISHED_EVENTS } from '../domain/events';
import {
  DEFAULT_PREFERENCES, Preferences, PreferencesPatch, THEMES, UI_LANGUAGES,
} from '../domain/preferences';
import { ProfileRepository } from '../ports/repositories';
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

/** Datos del JWT con los que se crea un perfil que falta (el nombre llega solo por iam.UserRegistered). */
export interface ProfileIdentity {
  email?: string;
}

export const makeUpdatePreferences = (deps: { profiles: ProfileRepository; eventPublisher: EventPublisher }) =>
  async (userId: string, body: unknown, identity: ProfileIdentity = {}): Promise<Preferences> => {
    const patch = parsePreferencesPatch(body);
    let updated = await deps.profiles.updatePreferences(userId, patch);
    if (!updated) {
      // Cuenta sin perfil: anterior a este servicio o su iam.UserRegistered se perdio. Se crea aqui;
      // createIfAbsent no recrea cuentas borradas, que siguen respondiendo 404.
      await deps.profiles.createIfAbsent({ userId, email: identity.email });
      updated = await deps.profiles.updatePreferences(userId, patch);
    }
    if (!updated) throw notFoundError('Perfil no encontrado');
    await publishQuietly(deps.eventPublisher, PUBLISHED_EVENTS.PreferencesChanged, { userId, ...patch });
    return updated;
  };

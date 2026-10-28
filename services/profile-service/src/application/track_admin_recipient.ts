import { AdminRecipientRepository } from '../ports/repositories';

export const ADMIN_ROLE = 'ADMIN';

const CACHE_TTL_MS = 60 * 60 * 1000;
/** Tope de usuarios recordados; al superarlo se vacia (solo cuesta alguna escritura de mas). */
const MAX_CACHED_USERS = 10_000;

interface Seen { isAdmin: boolean; at: number }

/**
 * Mantiene la lista local de admins a partir de los roles del JWT de cada peticion. Recuerda en
 * memoria lo ultimo registrado y solo va a la base si cambia el rol o pasa una hora.
 */
export const makeTrackAdminRecipient = (deps: { recipients: AdminRecipientRepository; now?: () => number }) => {
  const now = deps.now ?? Date.now;
  const seen = new Map<string, Seen>();

  return async (userId: string, roles: readonly string[]): Promise<void> => {
    const isAdmin = roles.includes(ADMIN_ROLE);
    const previous = seen.get(userId);
    if (previous && previous.isAdmin === isAdmin && now() - previous.at < CACHE_TTL_MS) return;

    await deps.recipients.touch(userId, isAdmin);
    if (seen.size >= MAX_CACHED_USERS) seen.clear();
    seen.set(userId, { isAdmin, at: now() });
  };
};

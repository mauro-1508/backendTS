import { UnitOfWork } from '../ports/repositories';
import { processEventOnce } from './process_event_once';

/**
 * iam.UserDeleted (Ley 1581): borra perfil, preferencias, notificaciones y logros del usuario y
 * lo registra como borrado para que un UserRegistered tardio no recree su perfil.
 * Idempotente por eventId (misma transaccion que el registro del evento).
 */
export const makeEraseUserProfile = (deps: { unitOfWork: UnitOfWork }) =>
  async (eventId: string, userId: string): Promise<void> => {
    await processEventOnce(deps.unitOfWork, eventId, async repositories => {
  // Coordina el borrado con las demás operaciones de esta cuenta.
  // El bloqueo se libera al terminar la transacción.
  await repositories.gamificationLocks.lockUser(userId);
  await repositories.profiles.eraseUser(userId);
});
  };

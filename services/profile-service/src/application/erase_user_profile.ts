import { UnitOfWork } from '../ports/repositories';
import { processEventOnce } from './process_event_once';

/**
 * iam.UserDeleted (Ley 1581): borra perfil, preferencias, notificaciones y logros del usuario y
 * lo registra como borrado para que un UserRegistered tardio no recree su perfil.
 * Idempotente por eventId (misma transaccion que el registro del evento).
 */
export const makeEraseUserProfile = (deps: { unitOfWork: UnitOfWork }) =>
  async (eventId: string, userId: string): Promise<void> => {
    await processEventOnce(deps.unitOfWork, eventId, repositories => repositories.profiles.eraseUser(userId));
  };

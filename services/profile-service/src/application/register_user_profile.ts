import { NewProfile, UnitOfWork } from '../ports/repositories';
import { processEventOnce } from './process_event_once';

/** Crea el perfil y las preferencias por defecto al registrarse un usuario (idempotente). */
export const makeRegisterUserProfile = (deps: { unitOfWork: UnitOfWork }) =>
  async (eventId: string, profile: NewProfile): Promise<void> => {
   await processEventOnce(deps.unitOfWork, eventId, async repositories => {
  // Espera el mismo turno que utiliza el borrado de esta cuenta.
  await repositories.gamificationLocks.lockUser(profile.userId);

  // Un aviso de registro que llegue tarde no debe recrear una cuenta eliminada.
  if (await repositories.profiles.isErased(profile.userId)) return;

  await repositories.profiles.createIfAbsent(profile);
});
  };

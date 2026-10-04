import { NewProfile, UnitOfWork } from '../ports/repositories';
import { processEventOnce } from './process_event_once';

/** Crea el perfil y las preferencias por defecto al registrarse un usuario (idempotente). */
export const makeRegisterUserProfile = (deps: { unitOfWork: UnitOfWork }) =>
  async (eventId: string, profile: NewProfile): Promise<void> => {
    await processEventOnce(deps.unitOfWork, eventId, repositories => repositories.profiles.createIfAbsent(profile));
  };

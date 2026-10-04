import { notFoundError } from '../domain/errors';
import { Profile } from '../domain/preferences';
import { ProfileRepository } from '../ports/repositories';

export const makeGetProfile = (deps: { profiles: ProfileRepository }) =>
  async (userId: string): Promise<Profile> => {
    const profile = await deps.profiles.findProfile(userId);
    if (!profile) throw notFoundError('Perfil no encontrado');
    return profile;
  };

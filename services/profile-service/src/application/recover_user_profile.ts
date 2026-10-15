import type { IdentityRecovery } from '@traduce/shared';
import { validationError } from '../domain/errors';
import type { NewProfile, UnitOfWork } from '../ports/repositories';

const MAX_IAM_USER_ID = 2_147_483_647;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Valida la identidad recibida para recuperar su proyección en Profile.
 * Esta validación no comprueba que la cuenta exista en IAM:
 * la integración que llame al caso de uso debe proporcionar esa garantía.
 */
export const parseIdentityRecovery = (
  input: unknown,
): IdentityRecovery => {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw validationError('La identidad debe ser un objeto');
  }

  const value = input as Record<string, unknown>;
  const allowed = new Set(['userId', 'email', 'name']);

  if (Object.keys(value).some(key => !allowed.has(key))) {
    throw validationError('La identidad contiene campos desconocidos');
  }

  const { userId, email, name } = value;

  if (
    typeof userId !== 'number' ||
    !Number.isInteger(userId) ||
    userId <= 0 ||
    userId > MAX_IAM_USER_ID
  ) {
    throw validationError('userId debe ser un identificador válido de IAM');
  }

  if (
    typeof email !== 'string' ||
    Array.from(email).length > 255 ||
    CONTROL_CHARACTERS.test(email) ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  ) {
    throw validationError(
      'email debe ser un correo válido de hasta 255 caracteres',
    );
  }

  if (
    name !== undefined &&
    name !== null &&
    (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      Array.from(name).length > 255 ||
      CONTROL_CHARACTERS.test(name)
    )
  ) {
    throw validationError(
      'name debe ser null, estar ausente o contener entre 1 y 255 caracteres válidos',
    );
  }

  // Conserva los valores recibidos sin inventar ni normalizar el nombre.
  return {
    userId,
    email,
    ...(name === undefined ? {} : { name }),
  };
};

/**
 * Recupera únicamente el perfil y las preferencias que falten.
 *
 * createIfAbsent conserva las filas existentes y UnitOfWork permite
 * revertir ambas inserciones si alguna falla.
 *
 * No utiliza processed_events: puede reparar datos aunque el evento
 * original de registro ya haya sido procesado.
 * No crea progreso, logros ni notificaciones.
 */
export const makeRecoverUserProfile = (
  deps: { unitOfWork: UnitOfWork },
) => async (input: unknown): Promise<void> => {
  const identity = parseIdentityRecovery(input);

  const profile: NewProfile = {
    userId: String(identity.userId),
    email: identity.email,
    ...(typeof identity.name === 'string'
      ? { fullName: identity.name }
      : {}),
  };

  await deps.unitOfWork.run(async ({ profiles }) => {
    await profiles.createIfAbsent(profile);
  });
};
export class InvalidUserDataError extends Error {}

/** Forma canonica del correo: sin espacios en los extremos y en minusculas (coincide con ck_users_email_normalized). */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const userDomainService = {
  normalizeEmail,

  ensureRegistrationIsValid({
    name,
    email,
    password,
  }: {
    name?: string;
    email?: string;
    password?: string;
  }): void {
    if (!name || !email || !password) {
      throw new InvalidUserDataError('Nombre, email y contraseña son obligatorios');
    }
  },
};

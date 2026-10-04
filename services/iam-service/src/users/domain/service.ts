export class InvalidUserDataError extends Error {}

export const userDomainService = {
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

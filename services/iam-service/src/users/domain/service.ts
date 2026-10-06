export class InvalidUserDataError extends Error {}

/** Error de negocio de la gestion de cuenta: codigo estable y estado HTTP para el cliente. */
export class AccountError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number
  ) {
    super(message);
  }
}
export class AccountValidationError extends AccountError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}
export class InvalidPasswordError extends AccountError {
  constructor() {
    super('La contraseña actual no es correcta', 'INVALID_PASSWORD', 403);
  }
}
export class LastAdminAccountError extends AccountError {
  constructor() {
    super('No puedes eliminar la cuenta del único administrador', 'LAST_ADMIN', 409);
  }
}
export class AccountNotFoundError extends AccountError {
  constructor() {
    super('Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }
}

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt ignora lo que pasa de 72 bytes: se rechaza en vez de truncar en silencio. */
export const MAX_PASSWORD_BYTES = 72;

export const accountDomainService = {
  /** Reglas de la contraseña nueva (la UI las repite, pero el servidor es quien manda). */
  ensureNewPasswordIsValid(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AccountValidationError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new AccountValidationError(`La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes`);
    }
    if (!/\p{Lu}/u.test(password)) throw new AccountValidationError('La contraseña debe incluir una mayúscula');
    if (!/\p{Ll}/u.test(password)) throw new AccountValidationError('La contraseña debe incluir una minúscula');
    if (!/\d/.test(password)) throw new AccountValidationError('La contraseña debe incluir un número');
    if (!/[^\p{L}\p{N}\s]/u.test(password)) throw new AccountValidationError('La contraseña debe incluir un símbolo');
  },
};

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

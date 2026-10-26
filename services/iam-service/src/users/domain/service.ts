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
/** Borrado de una cuenta sin contraseña con un codigo incorrecto, caducado, agotado o inexistente. */
export class InvalidDeletionCodeError extends AccountError {
  constructor() {
    super('Código incorrecto o vencido', 'INVALID_CODE', 400);
  }
}
/** Las cuentas con contraseña confirman el borrado con ella, no con un codigo al correo. */
export class PasswordAccountError extends AccountError {
  constructor() {
    super('Tu cuenta tiene contraseña: confirma con ella', 'HAS_PASSWORD', 409);
  }
}
export class DeletionCodeLimitError extends AccountError {
  constructor(reason: 'cooldown' | 'hourly_limit') {
    super(
      reason === 'cooldown' ? 'Espera un minuto antes de pedir otro código' : 'Demasiados códigos en la última hora',
      reason === 'cooldown' ? 'CODE_COOLDOWN' : 'CODE_LIMIT',
      429,
    );
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

/** Tipos de caracter que cuenta el registro; las mismas expresiones que `passwordStrength.ts` del Frontend. */
const REGISTRATION_PASSWORD_KINDS = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/];
export const MIN_REGISTRATION_PASSWORD_KINDS = 3;

/** Minimo del registro, igual al `meetsMinimum` de la app: 8 caracteres y 3 de los 4 tipos. */
export const meetsRegistrationPasswordMinimum = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH &&
  REGISTRATION_PASSWORD_KINDS.filter((kind) => kind.test(password)).length >= MIN_REGISTRATION_PASSWORD_KINDS;

/** Forma canonica del correo: sin espacios en los extremos y en minusculas (coincide con ck_users_email_normalized). */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const userDomainService = {
  normalizeEmail,

  ensureRegistrationIsValid({
    name,
    email,
    password,
    acceptedTerms,
    termsVersion,
  }: {
    name?: string;
    email?: string;
    password?: string;
    acceptedTerms?: boolean;
    termsVersion?: string;
  }): void {
    if (!name || !email || !password) {
      throw new InvalidUserDataError('Nombre, email y contraseña son obligatorios');
    }
    if (!meetsRegistrationPasswordMinimum(password)) {
      throw new InvalidUserDataError(
        'La contraseña debe tener al menos 8 caracteres y combinar 3 de estos tipos: mayúsculas, minúsculas, números y símbolos'
      );
    }
    // Ley 1581: la autorizacion debe ser expresa y quedar registrada con la version aceptada.
    if (acceptedTerms !== true || !termsVersion?.trim()) {
      throw new InvalidUserDataError('Debes aceptar los términos y la política de tratamiento de datos');
    }
  },
};

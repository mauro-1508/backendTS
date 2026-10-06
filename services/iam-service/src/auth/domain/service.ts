import { randomInt } from 'crypto';

export type IssueDecision = 'ok' | 'cooldown' | 'hourly_limit';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_HOUR = 5;
export const ONE_HOUR_MS = 60 * 60 * 1000;

/** Hash bcrypt (coste 10) de una clave inexistente: se compara cuando no hay usuario para igualar tiempos. */
export const DUMMY_HASH = '$2b$10$rkfeSplziI2zx6pmV8wlneYDuvOlPiBTNOL.fRa6lMtI0i1YFVO52';

/** Error de negocio conocido de auth: mensaje seguro de mostrar, con codigo estable para el cliente. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'AUTH_ERROR',
    public readonly httpStatus: number = 400
  ) {
    super(message);
  }
}
export class ValidationError extends AuthError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}
export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Credenciales inválidas', 'INVALID_CREDENTIALS');
  }
}
export class EmailAlreadyExistsError extends AuthError {
  constructor() {
    super('Este correo ya tiene una cuenta', 'EMAIL_ALREADY_EXISTS', 409);
  }
}
export class InvalidCodeError extends AuthError {
  constructor() {
    super('Código inválido', 'INVALID_CODE');
  }
}
export class EmailNotVerifiedError extends AuthError {
  constructor() {
    super('Debes verificar tu correo antes de iniciar sesión', 'EMAIL_NOT_VERIFIED', 403);
  }
}
export class AccountBlockedError extends AuthError {
  constructor() {
    super('Cuenta bloqueada', 'ACCOUNT_BLOCKED', 403);
  }
}
/** Fallo interno al crear la cuenta (p. ej. asignar rol): sin detalle al cliente, termina en 500. */
export class RegistrationFailedError extends Error {
  constructor() {
    super('No se pudo completar el registro');
  }
}

export const authDomainService = {
  /** Codigo de 6 digitos con ceros a la izquierda; `random` es inyectable para tests. */
  generateCode(random: (min: number, max: number) => number = randomInt): string {
    return random(0, 1_000_000).toString().padStart(6, '0');
  },

  codeExpiryDate(now: Date = new Date()): Date {
    return new Date(now.getTime() + CODE_TTL_MS);
  },

  /** Reenvio: 60 s desde el ultimo envio y maximo 5 en la ultima hora. Devuelve el motivo si se rechaza. */
  issueDecision(lastCreatedAt: Date | null, sentLastHour: number, now: Date = new Date()): IssueDecision {
    if (sentLastHour >= MAX_SENDS_PER_HOUR) return 'hourly_limit';
    if (lastCreatedAt && now.getTime() - lastCreatedAt.getTime() < RESEND_COOLDOWN_MS) return 'cooldown';
    return 'ok';
  },

  canIssueToken(lastCreatedAt: Date | null, sentLastHour: number, now: Date = new Date()): boolean {
    return authDomainService.issueDecision(lastCreatedAt, sentLastHour, now) === 'ok';
  },
};

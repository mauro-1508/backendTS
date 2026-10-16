import type { IdentityRecovery } from '../events/contracts';

// Identifican el formato para rechazar archivos de otro tipo
// o versiones que el importador todavía no soporta.
export const IDENTITY_FILE_FORMAT = 'iam-profile-recovery';
export const IDENTITY_FILE_VERSION = 1;

// Límites del archivo de recuperación.
// Si se superan, la operación debe fallar sin truncar datos.
export const MAX_IDENTITY_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_IDENTITIES = 100_000;

// Estados existentes en IAM.
// El exportador exigirá elegirlos explícitamente.
export const RECOVERY_STATUSES = [
  'ACTIVE', 'INACTIVE', 'BLOCKED',
] as const;

export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

/**
 * Archivo utilizado para trasladar identidades desde IAM a Profile.
 *
 * source identifica el entorno declarado, pero no autentica al productor.
 * statuses describe los estados seleccionados al exportar.
 * La recuperación no modifica el estado de las cuentas en IAM.
 */
export interface IdentityRecoveryFile {
  format: typeof IDENTITY_FILE_FORMAT;
  version: typeof IDENTITY_FILE_VERSION;
  source: string;
  exportedAt: string;
  statuses: RecoveryStatus[];
  identities: IdentityRecovery[];
}

/**
 * Exige una lista no vacía, sin duplicados y con estados conocidos.
 * No selecciona estados automáticamente.
 */
export const parseRecoveryStatuses = (
  input: unknown,
): RecoveryStatus[] => {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.some(value =>
      !RECOVERY_STATUSES.includes(value as RecoveryStatus),
    ) ||
    new Set(input).size !== input.length
  ) {
    throw new Error('Estados de recuperación inválidos');
  }

  return [...input] as RecoveryStatus[];
};
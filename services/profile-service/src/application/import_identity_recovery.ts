import { TextDecoder } from 'node:util';
import {
  IDENTITY_FILE_FORMAT,
  IDENTITY_FILE_VERSION,
  MAX_IDENTITIES,
  MAX_IDENTITY_FILE_BYTES,
  IdentityRecoveryFile,
  parseRecoverySource,
  parseRecoveryStatuses,
} from '@traduce/shared';
import { parseIdentityRecovery } from './recover_user_profile';

// Limita la antigüedad del archivo a una hora.
// Esto no garantiza que las cuentas sigan existiendo en IAM.
const MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Valida el archivo completo antes de permitir su aplicación.
 *
 * Comprueba formato, versión, entorno, fecha, estados e identidades.
 * Exige identificadores únicos y ordenados de menor a mayor.
 * Esta función no abre conexiones ni escribe en la base de datos.
 */
export const validateIdentityFile = (
  bytes: Buffer,
  source: string,
  now = Date.now(),
): IdentityRecoveryFile => {
  if (bytes.length > MAX_IDENTITY_FILE_BYTES) {
    throw new Error('Archivo demasiado grande');
  }

  const input: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  );

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Documento inválido');
  }

  const value = input as Record<string, unknown>;
  const keys = [
    'format',
    'version',
    'source',
    'exportedAt',
    'statuses',
    'identities',
  ];

  if (
    Object.keys(value).length !== keys.length ||
    keys.some(key =>
      !Object.prototype.hasOwnProperty.call(value, key),
    ) ||
    value.format !== IDENTITY_FILE_FORMAT ||
    value.version !== IDENTITY_FILE_VERSION ||
    parseRecoverySource(value.source) !== source
  ) {
    throw new Error('Contrato de archivo incompatible');
  }

  const timestamp = typeof value.exportedAt === 'string'
    ? Date.parse(value.exportedAt)
    : Number.NaN;

  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value.exportedAt ||
    timestamp > now ||
    now - timestamp > MAX_AGE_MS
  ) {
    throw new Error('Fecha de exportación inválida o vencida');
  }

  const statuses = parseRecoveryStatuses(value.statuses);

  if (
    !Array.isArray(value.identities) ||
    value.identities.length > MAX_IDENTITIES
  ) {
    throw new Error('Lista de identidades inválida');
  }

  let previous = 0;
  const identities = value.identities.map(inputIdentity => {
    const identity = parseIdentityRecovery(inputIdentity);

    if (identity.userId <= previous) {
      throw new Error('Identificadores duplicados o desordenados');
    }

    previous = identity.userId;
    return identity;
  });

  return {
    format: IDENTITY_FILE_FORMAT,
    version: IDENTITY_FILE_VERSION,
    source,
    exportedAt: value.exportedAt as string,
    statuses,
    identities,
  };
};

/**
 * Aplica un documento previamente validado mediante el caso de uso
 * de recuperación.
 *
 * Cada cuenta tiene su propia transacción. Si una falla, se detiene
 * el recorrido y las cuentas anteriores permanecen confirmadas.
 *
 * confirmed cuenta llamadas terminadas, no filas nuevas.
 * Para reintentar se puede recorrer nuevamente el archivo completo:
 * el caso de uso conserva las filas existentes.
 */
export const applyIdentityFile = async (
  document: IdentityRecoveryFile,
  recover: (identity: unknown) => Promise<void>,
): Promise<{ result: 'applied' | 'partial'; confirmed: number }> => {
  let confirmed = 0;

  for (const identity of document.identities) {
    try {
      await recover(identity);
      confirmed++;
    } catch {
      return { result: 'partial', confirmed };
    }
  }

  return { result: 'applied', confirmed };
};
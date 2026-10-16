import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { makePgPool } from '../database/postgres';
import { MAX_IDENTITY_FILE_BYTES } from './identity_file';

/**
 * Lee opciones con la sintaxis --nombre=valor.
 * Rechaza argumentos desconocidos, duplicados o sin valor.
 */
export const parseCommandOptions = (
  args: string[],
  allowed: readonly string[],
): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const argument of args) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);

    if (
      !match ||
      !allowed.includes(match[1]) ||
      Object.prototype.hasOwnProperty.call(result, match[1])
    ) {
      throw new Error('Opciones inválidas');
    }

    result[match[1]] = match[2];
  }

  return result;
};

/** Obtiene una opción obligatoria sin asignar valores predeterminados. */
export const requireOption = (
  options: Record<string, string>,
  name: string,
): string => {
  const value = options[name];
  if (!value) throw new Error(`Falta --${name}`);
  return value;
};

/**
 * Valida la etiqueta del entorno, por ejemplo test o staging.
 * La etiqueta sirve para comparar archivos; no autentica su origen.
 */
export const parseRecoverySource = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)
  ) {
    throw new Error('Origen inválido');
  }

  return value;
};

/**
 * Prepara la conexión con variables explícitas del servicio:
 * IAM_DB_* o PROFILE_DB_*.
 *
 * No carga archivos .env ni utiliza variables genéricas como alternativa.
 * Los permisos del usuario PostgreSQL deben limitar el acceso a su servicio.
 */
export const makeRecoveryPool = (
  prefix: 'IAM' | 'PROFILE',
  env: NodeJS.ProcessEnv = process.env,
) => {
  const required = (suffix: string): string => {
    const value = env[`${prefix}_DB_${suffix}`];
    if (!value) throw new Error('Configuración de base incompleta');
    return value;
  };

  const portText = required('PORT');
  const port = Number(portText);

  if (
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('Puerto de base inválido');
  }

  return makePgPool({
    host: required('HOST'),
    port,
    user: required('USER'),
    password: required('PASSWORD'),
    database: required('NAME'),
  });
};

/**
 * Lee el archivo completo con un límite de tamaño.
 * El importador validará y aplicará estos mismos bytes,
 * sin volver a abrir el archivo entre ambas operaciones.
 */
export const readRecoveryBytes = async (
  path: string,
): Promise<Buffer> => {
  const file = await open(path, 'r');

  try {
    if (!(await file.stat()).isFile()) {
      throw new Error('La entrada debe ser un archivo regular');
    }

    const chunks: Buffer[] = [];
    let total = 0;

    while (true) {
      const chunk = Buffer.alloc(64 * 1024);
      const { bytesRead } = await file.read(
        chunk,
        0,
        chunk.length,
        null,
      );

      if (bytesRead === 0) break;
      total += bytesRead;

      if (total > MAX_IDENTITY_FILE_BYTES) {
        throw new Error('Archivo demasiado grande');
      }

      chunks.push(chunk.subarray(0, bytesRead));
    }

    return Buffer.concat(chunks, total);
  } finally {
    await file.close();
  }
};

/**
 * Identifica el contenido exacto del archivo revisado.
 * El hash permite detectar cambios, pero no acredita quién lo produjo.
 */
export const recoveryDigest = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex');
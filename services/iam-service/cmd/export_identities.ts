import { randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';
import type { Pool } from 'pg';
import {
  IDENTITY_FILE_FORMAT,
  IDENTITY_FILE_VERSION,
  MAX_IDENTITIES,
  MAX_IDENTITY_FILE_BYTES,
  IdentityRecoveryFile,
  RecoveryStatus,
  makeRecoveryPool,
  parseCommandOptions,
  parseRecoverySource,
  parseRecoveryStatuses,
  recoveryDigest,
  requireOption,
} from '@traduce/shared';

const PAGE_SIZE = 500;

/**
 * Exporta identidades desde IAM en orden ascendente por user_id.
 *
 * Todas las páginas se consultan dentro de una misma instantánea
 * de solo lectura. Los estados incluidos se reciben explícitamente.
 * No consulta Profile ni modifica cuentas.
 */
export const exportIdentities = async (
  pool: Pool,
  source: string,
  statuses: RecoveryStatus[],
): Promise<IdentityRecoveryFile> => {
  const client = await pool.connect();

  try {
    await client.query(
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );

    const { rows: clock } = await client.query<{
      exported_at: Date;
    }>('SELECT transaction_timestamp() AS exported_at');

    const identities: IdentityRecoveryFile['identities'] = [];
    let after = 0;

    while (true) {
      const { rows } = await client.query<{
        user_id: number;
        email: string;
        name: string | null;
      }>(
        `SELECT user_id, email, name
           FROM public.users
          WHERE user_id > $1
            AND status = ANY($2::text[])
          ORDER BY user_id ASC
          LIMIT $3`,
        [after, statuses, PAGE_SIZE],
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        identities.push({
          userId: row.user_id,
          email: row.email,
          name: row.name,
        });
      }

      if (identities.length > MAX_IDENTITIES) {
        throw new Error('Demasiadas identidades');
      }

      after = rows[rows.length - 1].user_id;
    }

    await client.query('COMMIT');

    return {
      format: IDENTITY_FILE_FORMAT,
      version: IDENTITY_FILE_VERSION,
      source,
      exportedAt: clock[0].exported_at.toISOString(),
      statuses,
      identities,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Genera un archivo con permisos restringidos.
 * Publica el archivo final solo después de terminar su escritura
 * y falla si ya existe un archivo con ese nombre.
 */
const main = async (): Promise<void> => {
  const options = parseCommandOptions(
    process.argv.slice(2),
    ['output', 'source', 'statuses'],
  );

  const output = requireOption(options, 'output');
  const source = parseRecoverySource(
    requireOption(options, 'source'),
  );
  const statuses = parseRecoveryStatuses(
    requireOption(options, 'statuses').split(','),
  );

  const pool = makeRecoveryPool('IAM');
  let document: IdentityRecoveryFile;

  try {
    document = await exportIdentities(pool, source, statuses);
  } finally {
    await pool.end();
  }

  const bytes = Buffer.from(
    `${JSON.stringify(document)}\n`,
    'utf8',
  );

  if (bytes.length > MAX_IDENTITY_FILE_BYTES) {
    throw new Error('Archivo demasiado grande');
  }

  const temporary = `${output}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);

  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }

    // Ambos nombres pertenecen al mismo directorio.
    // El enlace falla si el destino ya existe.
    await link(temporary, output);
  } finally {
    await unlink(temporary);
  }

  // El resumen no imprime identidades ni credenciales.
  console.log(JSON.stringify({
    result: 'exported',
    accounts: document.identities.length,
    sha256: recoveryDigest(bytes),
  }));
};

// Importar este archivo desde las pruebas no ejecuta el comando.
if (require.main === module) {
  void main().catch(() => {
    // Evita imprimir errores SQL con datos o configuración sensible.
    console.error(JSON.stringify({ result: 'export_failed' }));
    process.exitCode = 1;
  });
}
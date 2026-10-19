import {
  makeRecoveryPool,
  parseCommandOptions,
  parseRecoverySource,
  readRecoveryBytes,
  recoveryDigest,
  requireOption,
} from '@traduce/shared';
import {
  applyIdentityFile,
  validateIdentityFile,
} from '../src/application/import_identity_recovery';
import {
  makeRecoverUserProfile,
} from '../src/application/recover_user_profile';
import {
  makePostgresUnitOfWork,
} from '../src/adapters/outbound/postgres/postgres_repositories';

/**
 * Valida o aplica un archivo de recuperación.
 *
 * El modo predeterminado es validate: revisa el archivo sin conectarse
 * a PostgreSQL. El modo apply exige confirmar el hash del archivo
 * y la ventana operativa sin eliminaciones de cuentas.
 */
const main = async (): Promise<void> => {
  const options = parseCommandOptions(
    process.argv.slice(2),
    ['input', 'source', 'mode', 'sha256', 'confirm-window'],
  );

  const mode = options.mode ?? 'validate';

  if (mode !== 'validate' && mode !== 'apply') {
    throw new Error('Modo inválido');
  }

  const source = parseRecoverySource(
    requireOption(options, 'source'),
  );
  const bytes = await readRecoveryBytes(
    requireOption(options, 'input'),
  );
  const sha256 = recoveryDigest(bytes);

  // Valida todas las identidades antes de abrir una conexión de escritura.
  // La aplicación utilizará el documento obtenido de estos mismos bytes.
  const document = validateIdentityFile(bytes, source);

  if (mode === 'validate') {
    console.log(JSON.stringify({
      result: 'validated',
      accounts: document.identities.length,
      statuses: document.statuses,
      sha256,
    }));
    return;
  }

  // El hash comprueba que se aplica el archivo revisado.
  // confirm-window declara una condición operativa:
  // este comando no suspende las eliminaciones por sí mismo.
  if (
    !/^[a-f0-9]{64}$/.test(options.sha256 ?? '') ||
    options.sha256 !== sha256 ||
    options['confirm-window'] !== 'yes'
  ) {
    throw new Error('Falta confirmar archivo y ventana operativa');
  }

  const pool = makeRecoveryPool('PROFILE');

  try {
    const recover = makeRecoverUserProfile({
      unitOfWork: makePostgresUnitOfWork(pool),
    });

    const result = await applyIdentityFile(document, recover);

    // Publica un resumen sin identidades ni credenciales.
    // confirmed indica llamadas terminadas, no filas creadas.
    console.log(JSON.stringify({
      ...result,
      total: document.identities.length,
      sha256,
    }));

    // Un fallo intermedio conserva los commits de las cuentas anteriores.
    // El archivo puede repetirse porque la recuperación es idempotente.
    if (result.result === 'partial') {
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
};

// Importar el archivo desde una prueba no ejecuta el comando.
if (require.main === module) {
  void main().catch(() => {
    // Evita imprimir identidades, credenciales o errores SQL completos.
    console.error(JSON.stringify({ result: 'import_failed' }));
    process.exitCode = 1;
  });
}
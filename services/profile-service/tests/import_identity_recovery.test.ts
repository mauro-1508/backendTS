import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  applyIdentityFile,
  validateIdentityFile,
} from '../src/application/import_identity_recovery';

// Fecha fija para que las pruebas no dependan del reloj del equipo.
const exportedAt = '2020-01-01T00:00:00.000Z';
const now = Date.parse(exportedAt);

// Cada prueba recibe un documento nuevo para evitar compartir cambios.
const document = () => ({
  format: 'iam-profile-recovery',
  version: 1,
  source: 'test',
  exportedAt,
  statuses: ['ACTIVE', 'INACTIVE'],
  identities: [
    { userId: 1, email: 'one@example.test' },
    { userId: 2, email: 'two@example.test', name: null },
    { userId: 3, email: 'three@example.test', name: 'Nombre' },
  ],
});

const encode = (value: unknown): Buffer =>
  Buffer.from(JSON.stringify(value), 'utf8');

it('valida nombres presentes, ausentes y null', () => {
  const input = document();

  assert.deepEqual(
    validateIdentityFile(encode(input), 'test', now),
    input,
  );
});

// Una identidad inválida al final debe impedir aplicar todo el archivo.
it('una última identidad inválida impide iniciar la aplicación', async () => {
  const input = document();
  input.identities[2].email = 'incorrecto';
  let calls = 0;

  await assert.rejects(async () => {
    const validated = validateIdentityFile(encode(input), 'test', now);

    await applyIdentityFile(validated, async () => {
      calls++;
    });
  });

  assert.equal(calls, 0);
});

it('rechaza versión, origen, campos desconocidos, duplicados y desorden', () => {
  const duplicate = document();
  duplicate.identities[2].userId = 2;

  const unordered = document();
  unordered.identities.reverse();

  for (const input of [
    { ...document(), format: 'otro-formato' },
    { ...document(), version: 2 },
    { ...document(), source: 'other' },
    { ...document(), password: 'forbidden' },
    duplicate,
    unordered,
  ]) {
    assert.throws(() =>
      validateIdentityFile(encode(input), 'test', now),
    );
  }
});

it('rechaza estados vacíos, desconocidos o duplicados', () => {
  for (const statuses of [
    [],
    ['UNKNOWN'],
    ['ACTIVE', 'ACTIVE'],
  ]) {
    assert.throws(() =>
      validateIdentityFile(
        encode({ ...document(), statuses }),
        'test',
        now,
      ),
    );
  }
});

it('rechaza fechas inválidas, futuras y archivos vencidos', () => {
  assert.throws(() =>
    validateIdentityFile(
      encode({ ...document(), exportedAt: 'fecha-invalida' }),
      'test',
      now,
    ),
  );

  assert.throws(() =>
    validateIdentityFile(
      encode({
        ...document(),
        exportedAt: new Date(now + 1).toISOString(),
      }),
      'test',
      now,
    ),
  );

  assert.throws(() =>
    validateIdentityFile(
      encode(document()),
      'test',
      now + 3_600_001,
    ),
  );
});

it('rechaza JSON y UTF-8 inválidos', () => {
  assert.throws(() =>
    validateIdentityFile(Buffer.from('{'), 'test', now),
  );

  assert.throws(() =>
    validateIdentityFile(Buffer.from([0xc3, 0x28]), 'test', now),
  );
});

// Este doble representa cuentas ya confirmadas.
// No demuestra transacciones PostgreSQL; comprueba el recorrido,
// la detención ante errores y el reintento del archivo completo.
it('detiene la aplicación y permite reintentar todo el archivo', async () => {
  const validated = validateIdentityFile(
    encode(document()),
    'test',
    now,
  );

  const committed = new Set<number>();
  let fail = true;

  const recover = async (input: unknown): Promise<void> => {
    const { userId } = input as { userId: number };

    if (userId === 2 && fail) {
      throw new Error('Fallo simulado');
    }

    committed.add(userId);
  };

  assert.deepEqual(
    await applyIdentityFile(validated, recover),
    { result: 'partial', confirmed: 1 },
  );
  assert.deepEqual([...committed], [1]);

  fail = false;

  assert.deepEqual(
    await applyIdentityFile(validated, recover),
    { result: 'applied', confirmed: 3 },
  );
  assert.deepEqual([...committed], [1, 2, 3]);
});

it('un archivo sin cuentas termina sin llamar a la recuperación', async () => {
  const validated = validateIdentityFile(
    encode({ ...document(), identities: [] }),
    'test',
    now,
  );

  let calls = 0;

  const result = await applyIdentityFile(validated, async () => {
    calls++;
  });

  assert.deepEqual(result, {
    result: 'applied',
    confirmed: 0,
  });
  assert.equal(calls, 0);
});
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { makeEraseUserProfile } from '../src/application/erase_user_profile';
import { makeRecoverUserProfile } from '../src/application/recover_user_profile';
import { makeRegisterUserProfile } from '../src/application/register_user_profile';
import { ProfileError } from '../src/domain/errors';
import { makeInMemoryStore } from './in_memory';

/**
 * Estas pruebas usan datos en memoria.
 * Comprueban el orden del bloqueo y la protección contra recreaciones;
 * no sustituyen las pruebas de concurrencia con PostgreSQL.
 */

it('el borrado adquiere el bloqueo antes de limpiar las filas', async () => {
  const store = makeInMemoryStore([]);
  const calls: string[] = [];

  store.repositories.gamificationLocks.lockUser = async () => {
    calls.push('lock');
  };
  store.repositories.profiles.eraseUser = async () => {
    calls.push('erase');
  };

  await makeEraseUserProfile({
    unitOfWork: store.unitOfWork,
  })('delete-7', '7');

  assert.deepEqual(calls, ['lock', 'erase']);
});

it('recuperar una cuenta eliminada falla bajo bloqueo sin crear filas', async () => {
  const store = makeInMemoryStore([]);
  store.erasedUsers.add('7');
  const calls: string[] = [];

  store.repositories.gamificationLocks.lockUser = async () => {
    calls.push('lock');
  };
  store.repositories.profiles.isErased = async () => {
    calls.push('isErased');
    return true;
  };
  store.repositories.profiles.createIfAbsent = async () => {
    assert.fail('No debe crear datos de una cuenta eliminada');
  };

  // Recuperar una identidad no depende de los eventos ya procesados.
  store.repositories.processedEvents.markIfNew = async () => {
    assert.fail('La recuperación no debe depender de processed_events');
  };

  await assert.rejects(
    makeRecoverUserProfile({ unitOfWork: store.unitOfWork })({
      userId: 7,
      email: 'account@example.test',
      name: null,
    }),
    (error: unknown) =>
      error instanceof ProfileError && error.code === 'ACCOUNT_DELETED',
  );

  assert.deepEqual(calls, ['lock', 'isErased']);
  assert.equal(store.profilesByUser.size, 0);
  assert.equal(store.preferencesByUser.size, 0);
});

it('un registro tardío adquiere el bloqueo y no recrea la cuenta eliminada', async () => {
  const store = makeInMemoryStore([]);
  store.erasedUsers.add('7');
  const calls: string[] = [];

  store.repositories.gamificationLocks.lockUser = async () => {
    calls.push('lock');
  };
  store.repositories.profiles.isErased = async () => {
    calls.push('isErased');
    return true;
  };
  store.repositories.profiles.createIfAbsent = async () => {
    assert.fail('No debe recrear el perfil');
  };

  await makeRegisterUserProfile({ unitOfWork: store.unitOfWork })(
    'late-registration',
    { userId: '7' },
  );

  assert.deepEqual(calls, ['lock', 'isErased']);
});
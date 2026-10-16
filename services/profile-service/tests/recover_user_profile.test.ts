import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  makeRecoverUserProfile,
  parseIdentityRecovery,
} from '../src/application/recover_user_profile';
import { ProfileError } from '../src/domain/errors';
import { makeInMemoryStore } from './in_memory';

const identity = {
  userId: 7,
  email: 'ada@example.com',
  name: 'Ada Lovelace',
};

// Una cuenta puede tener nombre, no enviarlo o tenerlo como null.
const identities = [
  identity,
  { userId: 7, email: identity.email },
  { userId: 7, email: identity.email, name: null },
];

// La recuperación debe funcionar aunque el evento original ya se procesó.
// Repetirla no debe duplicar filas ni crear avisos.
it('admite nombre presente, ausente y null sin inventar fullName', async () => {
  for (const input of identities) {
    const store = makeInMemoryStore([]);
    const recover = makeRecoverUserProfile({
      unitOfWork: store.unitOfWork,
    });

    await store.repositories.processedEvents.markIfNew('old-event');
    store.repositories.processedEvents.markIfNew = async () => {
      throw new Error('No debe acceder a processed_events');
    };

    await recover(input);
    await recover(input);

    assert.deepEqual(store.profilesByUser.get('7'), {
      userId: '7',
      email: identity.email,
      ...(typeof input.name === 'string'
        ? { fullName: input.name }
        : {}),
    });
    assert.equal(store.profilesByUser.size, 1);
    assert.equal(store.preferencesByUser.size, 1);
    assert.deepEqual(store.createdProfiles, ['7']);
    assert.deepEqual(store.notifications, []);
    assert.equal(store.notifiedAchievements.size, 0);
  }
});

// La validación conserva el nombre recibido, incluidos sus espacios.
// No aplica una política de normalización durante la reparación.
it('admite 255 caracteres y conserva el nombre recibido', () => {
  const name = ` ${'a'.repeat(253)} `;

  assert.equal(
    parseIdentityRecovery({ ...identity, name }).name,
    name,
  );
});

// Los datos inválidos deben rechazarse antes de intentar escribir.
it('rechaza entradas inválidas antes de abrir la transacción', async () => {
  let transactions = 0;
  const recover = makeRecoverUserProfile({
    unitOfWork: {
      async run() {
        transactions++;
        throw new Error('No debe abrir una transacción');
      },
    },
  });

  const invalid: unknown[] = [
    null,
    [],
    {},
    { ...identity, userId: '7' },
    { ...identity, userId: 0 },
    { ...identity, userId: -1 },
    { ...identity, userId: 1.5 },
    { ...identity, userId: NaN },
    { ...identity, userId: Infinity },
    { ...identity, userId: 2_147_483_648 },
    { ...identity, email: null },
    { ...identity, email: 'incorrecto' },
    { ...identity, email: `${'a'.repeat(250)}@example.com` },
    { ...identity, email: 'ada\u0000@example.com' },
    { ...identity, name: '' },
    { ...identity, name: ' ' },
    { ...identity, name: 123 },
    { ...identity, name: {} },
    { ...identity, name: 'a'.repeat(256) },
    { ...identity, name: 'Ada\u0000' },
    { ...identity, name: 'Ada\nLovelace' },
    { ...identity, createdAt: '2020-01-01T00:00:00Z' },
  ];

  for (const input of invalid) {
    await assert.rejects(
      recover(input),
      (error: unknown) =>
        error instanceof ProfileError &&
        error.code === 'VALIDATION_ERROR',
    );
  }

  assert.equal(transactions, 0);
});
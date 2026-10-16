import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryEventBus } from '@traduce/shared';
import { makeUpdatePreferences } from '../src/application/preferences';
import { ProfileRepository } from '../src/ports/repositories';
import { makeAchievement, makeInMemoryStore } from './in_memory';

const setup = () => {
  const store = makeInMemoryStore([makeAchievement('T1', 1)]);
  const profiles = store.repositories.profiles as ProfileRepository;
  const created: Array<{ userId: string; email?: string }> = [];
  const spied: ProfileRepository = {
    ...profiles,
    createIfAbsent: async (profile) => {
      created.push(profile);
      await profiles.createIfAbsent(profile);
    },
  };
  const update = makeUpdatePreferences({
    unitOfWork: { run: work => work({ ...store.repositories, profiles: spied }) },
    eventPublisher: new InMemoryEventBus(),
  });
  return { store, update, created };
};

describe('updatePreferences con perfil ausente', () => {
  it('cuenta sin perfil (evento perdido o anterior al servicio): lo crea con el correo del JWT y guarda', async () => {
    const { store, update, created } = setup();
    const result = await update('7', { theme: 'DARK' }, { email: 'ana@x.com' });
    assert.equal(result.theme, 'DARK');
    assert.deepEqual(created, [{ userId: '7', email: 'ana@x.com' }]);
    assert.equal(store.preferencesByUser.get('7')?.theme, 'DARK');
  });

  it('perfil existente: solo actualiza, no intenta crear', async () => {
    const { store, update, created } = setup();
    await store.repositories.profiles.createIfAbsent({ userId: '7' });
    const result = await update('7', { uiLanguage: 'EN' });
    assert.equal(result.uiLanguage, 'EN');
    assert.equal(created.length, 0);
  });

  it('cuenta borrada: no se recrea y responde 410', async () => {
    const { store, update } = setup();
    store.erasedUsers.add('7');
    await assert.rejects(update('7', { theme: 'DARK' }, { email: 'ana@x.com' }), { httpStatus: 410 });
    assert.equal(store.preferencesByUser.has('7'), false);
  });

  it('cuerpo invalido: 400 sin crear perfil', async () => {
    const { update, created } = setup();
    await assert.rejects(update('7', { theme: 'AZUL' }), { httpStatus: 400 });
    assert.equal(created.length, 0);
  });
});

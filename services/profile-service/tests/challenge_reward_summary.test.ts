import assert from 'node:assert/strict';
import { it } from 'node:test';
import express from 'express';
import { makeAuthMiddleware } from '@traduce/shared';
import { makeGetChallengeRewardSummary } from '../src/application/get_challenge_reward_summary';
import { makeProfileRoutes } from '../src/adapters/inbound/http/routes';
import { makePostgresChallengeRepository } from '../src/adapters/outbound/postgres/challenge_repository';
import { Queryable } from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeAchievement, makeInMemoryStore } from './in_memory';

it('suma solo recompensas concedidas, sin límite de medalla, y aísla usuarios; leer no escribe', async () => {
  const store = makeInMemoryStore([makeAchievement('dailyChallengePoints500', 500)]);
  store.rewards.set('a1', { userId: '7', points: 3000 });
  store.rewards.set('a2', { userId: '7', points: 245 });
  store.rewards.set('b1', { userId: '8', points: 9000 });
  store.challenges.push({ challengeId: 'catalog', code: 'UNGRANTED', name: 'Catalog', description: '', targetCount: 1, points: 999999, localizations: {} });
  const read = makeGetChallengeRewardSummary({ challenges: store.repositories.challenges });
  const before = structuredClone({ rewards: store.rewards, assignments: store.assignments, profiles: store.profilesByUser, notifications: store.notifications });
  assert.deepEqual(await read('7'), { success: true, data: { totalPoints: 3245 } });
  assert.deepEqual(await read('8'), { success: true, data: { totalPoints: 9000 } });
  assert.deepEqual(await read('without-rewards'), { success: true, data: { totalPoints: 0 } });
  assert.deepEqual(await read('7'), { success: true, data: { totalPoints: 3245 } });
  assert.deepEqual({ rewards: store.rewards, assignments: store.assignments, profiles: store.profilesByUser, notifications: store.notifications }, before);
  assert.equal(store.createdProfiles.length, 0);
});

it('reutiliza rewardTotal: consulta parametrizada solo sobre challenge_rewards y convierte el agregado PG', async () => {
  const calls: { sql: string; args: unknown[] }[] = [];
  const challenges = makePostgresChallengeRepository({ query: async (sql: string, args: unknown[]) => {
    calls.push({ sql, args }); return { rows: [{ total: '5245' }] };
  } } as unknown as Queryable);
  assert.equal((await makeGetChallengeRewardSummary({ challenges })('user-7')).data.totalPoints, 5245);
  assert.deepEqual(calls, [{ sql: 'SELECT COALESCE(sum(points),0) AS total FROM challenge_rewards WHERE user_id=$1', args: ['user-7'] }]);
});

it('propaga fallo de consulta y rechaza totales no representables; nunca inventa cero', async () => {
  for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(makeGetChallengeRewardSummary({ challenges: { rewardTotal: async () => value } })('7'));
  }
  await assert.rejects(makeGetChallengeRewardSummary({ challenges: { rewardTotal: async () => { throw new Error('offline'); } } })('7'), /offline/);
});

it('API requiere JWT, usa identidad autenticada, rechaza administrador y no escribe directorio', async () => {
  const store = makeInMemoryStore([]);
  store.rewards.set('one', { userId: '7', points: 125 });
  store.rewards.set('two', { userId: '8', points: 50 });
  const read = makeGetChallengeRewardSummary({ challenges: store.repositories.challenges });
  const auth = makeAuthMiddleware({ sign: () => 'unused', verify: value => {
    if (!['7', '8', 'empty', 'admin'].includes(value)) throw new Error('invalid');
    return { email: 'local@example.invalid', userId: value === '8' ? 8 : value === 'empty' ? 9 : 7, roles: [], permissions: value === 'admin' ? ['users.manage'] : [] };
  } });
  const routes = makeProfileRoutes({ authMiddleware: auth, trackAdmin: async () => { assert.fail('No debe escribir directorio'); },
    useCases: { getChallengeRewardSummary: read } as never });
  const app = express(); app.use('/api/profile', routes.profile);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/profile/challenges/rewards/summary?userId=8`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    for (const [token, expected] of [['7', 125], ['8', 50], ['empty', 0]] as const) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, data: { totalPoints: expected } });
    }
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer admin' } })).status, 403);
    assert.equal(store.assignments.size, 0);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

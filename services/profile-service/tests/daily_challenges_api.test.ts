import assert from 'node:assert/strict';
import { it } from 'node:test';
import express from 'express';
import { makeAuthMiddleware } from '@traduce/shared';
import { makeProfileRoutes } from '../src/adapters/inbound/http/routes';
import { makeGetTodayChallenge } from '../src/application/daily_challenge';
import { makeInMemoryStore } from './in_memory';

it('API exige JWT, usa solo identidad del token y conserva contrato y prefijo', async () => {
  const store = makeInMemoryStore([]);
  store.challenges.push({ challengeId: 'id', code: 'TRANSLATE_1', name: 'Una', description: 'Una traducción guardada', targetCount: 1, points: 5, localizations: {} });
  const seen: string[] = [];
  const read = makeGetTodayChallenge({ unitOfWork: store.unitOfWork, now: () => new Date('2026-10-25T12:00:00Z') });
  const auth = makeAuthMiddleware({ sign: () => 'unused', verify: value => {
    if (!['user','admin'].includes(value)) throw new Error('Invalid test identity');
    return { userId: 7, email: 'test@example.test', roles: [], permissions: value === 'admin' ? ['users.manage'] : [] };
  } });
  const router = makeProfileRoutes({ authMiddleware: auth, trackAdmin: async () => { assert.fail('GET del reto no escribe directorio'); }, useCases: {
    getTodayChallenge: async (id: string) => { seen.push(id); return read(id); },
  } as never }).profile;
  const app = express(); app.use('/api/profile', router);
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/profile/challenges/today?userId=99`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url,{ headers: { Authorization: 'Bearer invalid' } })).status, 401);
    const response = await fetch(url,{ headers: { Authorization: 'Bearer user' } });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.success, true);
    assert.deepEqual(Object.keys(body.data).sort(), ['challengeId','code','name','description','targetCount','currentCount','points','completed','completedAt','date'].sort());
    assert.equal(body.data.currentCount,0); assert.deepEqual(seen,['7']);
    assert.equal(store.assignments.size,0);
    assert.equal((await fetch(url,{ headers: { Authorization: 'Bearer admin' } })).status,403);
    assert.deepEqual(seen,['7']);
  } finally { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())); }
});

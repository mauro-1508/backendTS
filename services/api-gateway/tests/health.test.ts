import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthReport, FetchLike } from '../src/health';
import { SERVICE_NAMES, ServiceName } from '../src/route_table';

const URLS = Object.fromEntries(SERVICE_NAMES.map(name => [name, `http://${name}`])) as Record<ServiceName, string>;

/** Cada servicio responde 200 con el cuerpo indicado (por defecto `{ status: 'ok' }`). */
const fetchWith = (bodies: Partial<Record<ServiceName, unknown>>): FetchLike => async url => {
  const name = SERVICE_NAMES.find(service => url.startsWith(URLS[service]))!;
  return { ok: true, json: async () => bodies[name] ?? { status: 'ok' } };
};

const report = (fetchFn: FetchLike) => buildHealthReport({ serviceUrls: URLS, timeoutMs: 100, fetchFn, version: '1.0.0' });

describe('buildHealthReport con servicios degraded', () => {
  test('un servicio degraded: el reporte queda degraded y publica solo los codigos', async () => {
    const body = await report(fetchWith({
      iam: { status: 'degraded', service: 'iam-service', issues: ['outbox_backlog'], details: { outbox: { pending: 4 } } },
    }));
    assert.equal(body.status, 'degraded');
    assert.deepEqual(body.services.iam, { status: 'degraded', issues: ['outbox_backlog'] });
    assert.deepEqual(body.services.profile, { status: 'up' });
    assert.ok(!JSON.stringify(body).includes('pending'));
  });

  test('descarta codigos con forma rara en vez de publicarlos', async () => {
    const body = await report(fetchWith({
      profile: { status: 'degraded', issues: ['dead_letters', '<script>', 42, 'x'.repeat(41)] },
    }));
    assert.deepEqual(body.services.profile, { status: 'degraded', issues: ['dead_letters'] });
  });

  test('un cuerpo ilegible o sin json cuenta como up (servicios que aun no informan)', async () => {
    const noJson: FetchLike = async () => ({ ok: true });
    assert.equal((await report(noJson)).status, 'ok');
    const broken: FetchLike = async () => ({ ok: true, json: async () => { throw new Error('no es json'); } });
    assert.equal((await report(broken)).status, 'ok');
  });
});

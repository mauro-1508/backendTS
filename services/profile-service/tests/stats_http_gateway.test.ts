import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PERMISSIONS, TokenClaims, TokenProvider } from '@traduce/shared';
import { makeStatsHttpGateway } from '../src/adapters/outbound/http/stats_http_gateway';

const validStats = {
  totalTranslations: 10,
  activeUsers30d: 3,
  daily: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${10 + i}`, count: i })),
  weekly: Array.from({ length: 4 }, (_, i) => ({ weekStart: `2026-09-${10 + i}`, count: i })),
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${i + 1}`, count: i })),
};

interface Recorded { url: string; init: RequestInit | undefined }

const setup = (respond: (url: string) => { status?: number; body: unknown } | Error) => {
  const requests: Recorded[] = [];
  const signed: TokenClaims[] = [];
  const serviceTokens: TokenProvider = {
    sign: claims => { signed.push(claims); return 'fake-service-token'; },
    verify: () => { throw new Error('no se usa'); },
  };
  const fetchFn = (async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    const result = respond(String(url));
    if (result instanceof Error) throw result;
    const status = result.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => result.body };
  }) as unknown as typeof fetch;
  const gateway = makeStatsHttpGateway({
    recognitionUrl: 'http://recognition:3003',
    analyticsUrl: 'http://analytics:3005',
    serviceTokens,
    fetchFn,
  });
  return { gateway, requests, signed };
};

describe('stats_http_gateway', () => {
  it('con una respuesta no OK cancela el cuerpo antes de lanzar', async () => {
    let cancelled = false;
    const fetchFn = (async () => ({
      ok: false, status: 503, body: { cancel: async () => { cancelled = true; } },
    })) as unknown as typeof fetch;
    const gateway = makeStatsHttpGateway({
      recognitionUrl: 'http://recognition:3003',
      analyticsUrl: 'http://analytics:3005',
      serviceTokens: { sign: () => 'fake-service-token', verify: () => { throw new Error('no se usa'); } },
      fetchFn,
    });
    await assert.rejects(gateway.translationStats(), /503/);
    assert.equal(cancelled, true);
  });

  it('translationStats parsea la forma correcta y envia el bearer de servicio', async () => {
    const { gateway, requests, signed } = setup(() => ({ body: { success: true, data: validStats } }));
    const result = await gateway.translationStats();

    assert.deepEqual(result, validStats);
    assert.equal(requests[0].url, 'http://recognition:3003/api/translations/stats');
    assert.deepEqual(requests[0].init?.headers, { Authorization: 'Bearer fake-service-token' });
    assert.deepEqual(signed[0].permissions, [PERMISSIONS.STATS_READ]);
    assert.deepEqual(signed[0].roles, []);
  });

  it('translationStats rechaza formas invalidas', async () => {
    const invalid: Record<string, unknown> = {
      'sin data': undefined,
      'data nulo': null,
      'total negativo': { ...validStats, totalTranslations: -1 },
      'total texto': { ...validStats, totalTranslations: '10' },
      'activos NaN': { ...validStats, activeUsers30d: NaN },
      'daily corto': { ...validStats, daily: validStats.daily.slice(1) },
      'weekly sin weekStart': { ...validStats, weekly: validStats.weekly.map(p => ({ count: p.count })) },
      'monthly con count invalido': { ...validStats, monthly: validStats.monthly.map(p => ({ ...p, count: 'x' })) },
      'daily no es arreglo': { ...validStats, daily: {} },
    };
    for (const [name, data] of Object.entries(invalid)) {
      const { gateway } = setup(() => ({ body: { data } }));
      await assert.rejects(gateway.translationStats(), /forma esperada|cuerpo invalido/, name);
    }
  });

  it('rechaza un cuerpo que no es objeto y los HTTP no exitosos', async () => {
    await assert.rejects(setup(() => ({ body: null })).gateway.translationStats(), /cuerpo invalido/);
    await assert.rejects(setup(() => ({ status: 503, body: {} })).gateway.translationStats(), /503/);
    await assert.rejects(setup(() => ({ status: 401, body: {} })).gateway.sectionVisits({ from: 'a', to: 'b' }), /401/);
  });

  it('propaga los errores de red', async () => {
    const { gateway } = setup(() => new Error('ECONNREFUSED'));
    await assert.rejects(gateway.translationStats(), /ECONNREFUSED/);
  });

  it('sectionVisits manda el rango como query, el bearer, y devuelve solo section y visits', async () => {
    const { gateway, requests } = setup(() => ({
      body: { data: { sections: [{ section: 'HOME', visits: 4, extra: 'x' }, { section: 'LEXICON', visits: 0 }] } },
    }));
    const result = await gateway.sectionVisits({ from: '2026-10-12', to: '2026-10-18' });

    assert.deepEqual(result, [{ section: 'HOME', visits: 4 }, { section: 'LEXICON', visits: 0 }]);
    assert.equal(requests[0].url, 'http://analytics:3005/api/analytics/reports/sections?from=2026-10-12&to=2026-10-18');
    assert.deepEqual(requests[0].init?.headers, { Authorization: 'Bearer fake-service-token' });
  });

  it('sectionVisits acepta una lista vacia y rechaza formas invalidas', async () => {
    assert.deepEqual(await setup(() => ({ body: { data: { sections: [] } } })).gateway.sectionVisits({ from: 'a', to: 'b' }), []);
    const invalid = [undefined, {}, { sections: 'x' }, { sections: [{ section: 1, visits: 1 }] }, { sections: [{ section: 'HOME', visits: -2 }] }];
    for (const data of invalid) {
      await assert.rejects(
        setup(() => ({ body: { data } })).gateway.sectionVisits({ from: 'a', to: 'b' }),
        /forma esperada/,
      );
    }
  });

  it('signTemplateSummary cuenta palabras distintas y plantillas, sin bearer (ruta publica)', async () => {
    const { gateway, requests, signed } = setup(() => ({
      body: { data: [{ label: 'hola' }, { label: 'hola' }, { label: 'gracias' }] },
    }));
    assert.deepEqual(await gateway.signTemplateSummary(), { words: 2, templates: 3 });
    assert.equal(requests[0].url, 'http://recognition:3003/api/recognition/sign-templates');
    assert.deepEqual(requests[0].init?.headers, {});
    assert.equal(signed.length, 0);
  });

  it('signTemplateSummary con lista vacia da 0/0 y rechaza formas invalidas', async () => {
    assert.deepEqual(await setup(() => ({ body: { data: [] } })).gateway.signTemplateSummary(), { words: 0, templates: 0 });
    for (const data of [undefined, {}, [{ label: 5 }], [{}]]) {
      await assert.rejects(setup(() => ({ body: { data } })).gateway.signTemplateSummary(), /forma esperada/);
    }
  });
});

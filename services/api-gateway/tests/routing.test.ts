import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { makeJwtTokenProvider } from '@traduce/shared';
import { makeGatewayApp } from '../src/app';
import { loadGatewayConfig } from '../src/config';
import { DEV_CORS_ORIGINS, resolveCorsOrigins } from '../src/cors_options';
import { ROUTE_PREFIXES, SERVICE_NAMES, ServiceName } from '../src/route_table';

const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-gateway', expiresIn: '1h' });

/** Servicio falso: devuelve quien es y lo que recibio. */
const startUpstream = (name: ServiceName): Promise<Server> =>
  new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          service: name,
          method: req.method,
          url: req.url,
          authorization: req.headers.authorization ?? null,
          body: Buffer.concat(chunks).toString(),
        }));
      });
    });
    server.listen(0, () => resolve(server));
  });

const urlOf = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const listen = (server: Server): Promise<void> => new Promise(resolve => server.listen(0, resolve));
const close = (server: Server): Promise<void> => new Promise(resolve => server.close(() => resolve()));

describe('api-gateway', () => {
  const upstreams = {} as Record<ServiceName, Server>;
  let lexiconDown: Server;
  let gateway: Server;
  let base: string;

  const buildGateway = (rateLimitMax = 1000, serviceUrls?: Record<ServiceName, string>, authRateLimitMax = 1000) => {
    const urls = serviceUrls ?? Object.fromEntries(
      SERVICE_NAMES.map(name => [name, urlOf(upstreams[name])]),
    ) as Record<ServiceName, string>;
    return makeGatewayApp({
      config: { serviceUrls: urls, rateLimit: { windowMs: 60_000, maxRequests: rateLimitMax },
        authRateLimit: { windowMs: 60_000, maxRequests: authRateLimitMax },
        healthTimeoutMs: 500,
        corsOrigins: ['http://localhost:8081'],
      },
      tokenProvider,
    });
  };

  before(async () => {
    for (const name of SERVICE_NAMES) upstreams[name] = await startUpstream(name);
    gateway = http.createServer(buildGateway());
    await listen(gateway);
    base = urlOf(gateway);
  });

  after(async () => {
    await close(gateway);
    for (const name of SERVICE_NAMES) await close(upstreams[name]);
  });

  describe('ruteo por prefijo', () => {
    for (const service of SERVICE_NAMES) {
      for (const prefix of ROUTE_PREFIXES[service]) {
        test(`${prefix} -> ${service}`, async () => {
          const response = await fetch(`${base}${prefix}/algo?x=1`);
          const body = await response.json() as { service: string; url: string };
          assert.equal(body.service, service);
          assert.equal(body.url, `${prefix}/algo?x=1`);
        });
      }
    }

    test('el prefijo exacto tambien se enruta', async () => {
      const body = await (await fetch(`${base}/api/lexicon`)).json() as { service: string };
      assert.equal(body.service, 'lexicon');
    });

    test('reenvia metodo y cuerpo', async () => {
      const response = await fetch(`${base}/api/translations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ a: 1 }),
      });
      const body = await response.json() as { method: string; body: string };
      assert.equal(body.method, 'POST');
      assert.equal(body.body, '{"a":1}');
    });

    test('un prefijo que solo se parece (/api/lexiconX) no se enruta: 404', async () => {
      const response = await fetch(`${base}/api/lexiconX`);
      assert.equal(response.status, 404);
    });

    test('ruta desconocida: 404 con code NOT_FOUND', async () => {
      const response = await fetch(`${base}/api/nada`);
      assert.equal(response.status, 404);
      assert.equal(((await response.json()) as { code: string }).code, 'NOT_FOUND');
    });
  });

  describe('JWT opcional', () => {
    test('sin token la peticion pasa', async () => {
      assert.equal((await fetch(`${base}/api/lexicon`)).status, 200);
    });

    test('token valido: pasa y se reenvia la cabecera Authorization', async () => {
      const token = tokenProvider.sign({ userId: 1, email: 'a@b.c', roles: [] });
      const response = await fetch(`${base}/api/lexicon`, { headers: { authorization: `Bearer ${token}` } });
      const body = await response.json() as { authorization: string };
      assert.equal(response.status, 200);
      assert.equal(body.authorization, `Bearer ${token}`);
    });

    test('token invalido: 401 sin llegar al servicio', async () => {
      const response = await fetch(`${base}/api/lexicon`, { headers: { authorization: 'Bearer basura' } });
      assert.equal(response.status, 401);
      assert.equal(((await response.json()) as { code: string }).code, 'UNAUTHORIZED');
    });

    test('/api/auth no se bloquea por un token viejo', async () => {
      const response = await fetch(`${base}/api/auth/login`, { headers: { authorization: 'Bearer caducado' } });
      assert.equal(response.status, 200);
    });
  });

  describe('servicio caido', () => {
    test('502 BAD_GATEWAY cuando el servicio no responde', async () => {
      lexiconDown = http.createServer();
      await listen(lexiconDown);
      const deadUrl = urlOf(lexiconDown);
      await close(lexiconDown);

      const app = http.createServer(buildGateway(1000, {
        ...Object.fromEntries(SERVICE_NAMES.map(n => [n, urlOf(upstreams[n])])),
        lexicon: deadUrl,
      } as Record<ServiceName, string>));
      await listen(app);
      try {
        const original = console.error;
        console.error = () => {};
        const response = await fetch(`${urlOf(app)}/api/lexicon`).finally(() => { console.error = original; });
        assert.equal(response.status, 502);
        assert.equal(((await response.json()) as { code: string }).code, 'BAD_GATEWAY');
      } finally {
        await close(app);
      }
    });
  });

  describe('GET /health', () => {
    test('todos arriba: status ok', async () => {
      const response = await fetch(`${base}/health`);
      const body = await response.json() as { status: string; services: Record<string, { status: string }> };
      assert.equal(response.status, 200);
      assert.equal(body.status, 'ok');
      assert.deepEqual(Object.keys(body.services).sort(), [...SERVICE_NAMES].sort());
      assert.ok(Object.values(body.services).every(s => s.status === 'up'));
    });

    test('un servicio caido: status degraded y ese servicio en down', async () => {
      const dead = http.createServer();
      await listen(dead);
      const deadUrl = urlOf(dead);
      await close(dead);
      const app = http.createServer(buildGateway(1000, {
        ...Object.fromEntries(SERVICE_NAMES.map(n => [n, urlOf(upstreams[n])])),
        analytics: deadUrl,
      } as Record<ServiceName, string>));
      await listen(app);
      try {
        const body = await (await fetch(`${urlOf(app)}/health`)).json() as
          { status: string; services: Record<string, { status: string }> };
        assert.equal(body.status, 'degraded');
        assert.equal(body.services.analytics.status, 'down');
        assert.equal(body.services.iam.status, 'up');
      } finally {
        await close(app);
      }
    });
  });

  describe('rate limit', () => {
    test('supera el maximo: 429 RATE_LIMITED', async () => {
      const app = http.createServer(buildGateway(2));
      await listen(app);
      try {
        const statuses: number[] = [];
        for (let i = 0; i < 3; i++) statuses.push((await fetch(`${urlOf(app)}/api/lexicon`)).status);
        assert.deepEqual(statuses, [200, 200, 429]);
      } finally {
        await close(app);
      }
    });

    test('los endpoints sensibles de /api/auth tienen un límite más estricto', async () => {
      const app = http.createServer(buildGateway(1000, undefined, 2));
      await listen(app);
      try {
        const statuses: number[] = [];
        for (let i = 0; i < 3; i++) {
          statuses.push((await fetch(`${urlOf(app)}/api/auth/login`, { method: 'POST' })).status);
        }
        assert.deepEqual(statuses, [200, 200, 429]);
        assert.equal((await fetch(`${urlOf(app)}/api/auth/forgot-password`, { method: 'POST' })).status, 429);
      } finally {
        await close(app);
      }
    });

    test('el resto de rutas no usa el límite de auth', async () => {
      const app = http.createServer(buildGateway(1000, undefined, 1));
      await listen(app);
      try {
        for (let i = 0; i < 3; i++) {
          assert.equal((await fetch(`${urlOf(app)}/api/lexicon`)).status, 200);
        }
      } finally {
        await close(app);
      }
    });
  });
});

describe('CORS', () => {
  const allowed = 'http://localhost:8081';
  const preflight = async (origin: string) => {
    const app = makeGatewayApp({
      config: {
        serviceUrls: Object.fromEntries(SERVICE_NAMES.map(name => [name, 'http://127.0.0.1:1'])) as Record<ServiceName, string>,
        rateLimit: { windowMs: 60_000, maxRequests: 100 },
        authRateLimit: { windowMs: 60_000, maxRequests: 100 },
        healthTimeoutMs: 100,
        corsOrigins: [allowed],
      },
      tokenProvider,
    });
    const server = http.createServer(app);
    await listen(server);
    try {
      return (await fetch(`${urlOf(server)}/health`, { headers: { origin } })).headers.get('access-control-allow-origin');
    } finally {
      await close(server);
    }
  };

  test('un origen de la lista blanca recibe cabecera CORS', async () => {
    assert.equal(await preflight(allowed), allowed);
  });

  test('un origen fuera de la lista no recibe cabecera CORS', async () => {
    assert.equal(await preflight('https://malo.example.com'), null);
  });
});

describe('resolveCorsOrigins', () => {
  test('usa CORS_ORIGINS separado por comas', () => {
    assert.deepEqual(resolveCorsOrigins(' https://a.com , https://b.com ', true), ['https://a.com', 'https://b.com']);
  });

  test('sin variable: Expo web en desarrollo y ninguno en producción', () => {
    assert.deepEqual(resolveCorsOrigins(undefined, false), DEV_CORS_ORIGINS);
    assert.deepEqual(resolveCorsOrigins('', true), []);
  });
});

describe('loadGatewayConfig', () => {
  const JWT_SECRET = 'g'.repeat(32);

  test('aborta si JWT_SECRET falta o es corto', () => {
    assert.throws(() => loadGatewayConfig({}), /JWT_SECRET/);
    assert.throws(() => loadGatewayConfig({ JWT_SECRET: 'corto' }), /JWT_SECRET/);
  });

  test('URLs por defecto en los puertos 3001-3005', () => {
    const config = loadGatewayConfig({ JWT_SECRET });
    assert.equal(config.port, 8080);
    assert.equal(config.serviceUrls.iam, 'http://localhost:3001');
    assert.equal(config.serviceUrls.profile, 'http://localhost:3005');
  });

  test('las URLs se sobreescriben por env', () => {
    const config = loadGatewayConfig({ JWT_SECRET, LEXICON_SERVICE_URL: 'http://lexicon-service:3003', PORT: '9000' });
    assert.equal(config.serviceUrls.lexicon, 'http://lexicon-service:3003');
    assert.equal(config.port, 9000);
  });
});

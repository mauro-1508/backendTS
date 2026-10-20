import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Response } from 'express';
import { makeAuthMiddleware } from '@traduce/shared';
import { makeProfileRoutes } from '../src/adapters/inbound/http/routes';
import { makePostgresAdminRecipientRepository } from '../src/adapters/outbound/postgres/admin_report_repositories';
import { makeTrackAdminRecipient } from '../src/application/track_admin_recipient';
import { AdminRecipientRepository } from '../src/ports/repositories';

const makeRecipients = () => {
  const admins = new Set<string>();
  const repository: AdminRecipientRepository = {
    touch: async (userId, isAdmin) => { if (isAdmin) admins.add(userId); else admins.delete(userId); },
    listActive: async () => [...admins].map(userId => ({ userId, uiLanguage: 'ES' as const })),
  };
  return { admins, repository };
};

describe('makeTrackAdminRecipient', () => {
  it('registra a quien tiene el rol ADMIN', async () => {
    const { admins, repository } = makeRecipients();
    await makeTrackAdminRecipient({ recipients: repository })('7', ['USER', 'ADMIN']);
    assert.deepEqual([...admins], ['7']);
  });

  it('lo quita cuando ya no tiene el rol', async () => {
    const { admins, repository } = makeRecipients();
    const track = makeTrackAdminRecipient({ recipients: repository });
    await track('7', ['ADMIN']);
    await track('7', ['USER']);
    assert.equal(admins.size, 0);
  });

  it('sin roles no es admin; el rol distingue mayusculas', async () => {
    const { admins, repository } = makeRecipients();
    const track = makeTrackAdminRecipient({ recipients: repository });
    await track('7', []);
    await track('8', ['admin', 'LINGUIST']);
    assert.equal(admins.size, 0);
  });

  it('con cache: misma persona y rol dentro de la hora no vuelve a la base; al caducar si', async () => {
    const touches: string[] = [];
    let clock = 1_000;
    const track = makeTrackAdminRecipient({
      recipients: { touch: async (userId, isAdmin) => { touches.push(`${userId}:${isAdmin}`); }, listActive: async () => [] },
      now: () => clock,
    });
    await track('7', ['ADMIN']);
    await track('7', ['ADMIN']);
    clock += 59 * 60 * 1000;
    await track('7', ['ADMIN']);
    assert.deepEqual(touches, ['7:true']);

    clock += 2 * 60 * 1000;
    await track('7', ['ADMIN']);
    assert.deepEqual(touches, ['7:true', '7:true']);
  });

  it('con cache: un cambio de rol va a la base de inmediato', async () => {
    const touches: string[] = [];
    const track = makeTrackAdminRecipient({
      recipients: { touch: async (userId, isAdmin) => { touches.push(`${userId}:${isAdmin}`); }, listActive: async () => [] },
      now: () => 1_000,
    });
    await track('7', ['ADMIN']);
    await track('7', ['USER']);
    await track('7', ['USER']);
    assert.deepEqual(touches, ['7:true', '7:false']);
  });

  it('con cache: si la base falla no se recuerda y se reintenta en la siguiente peticion', async () => {
    let failing = true;
    let touches = 0;
    const track = makeTrackAdminRecipient({
      recipients: {
        touch: async () => { touches++; if (failing) throw new Error('db caida'); },
        listActive: async () => [],
      },
    });
    await assert.rejects(track('7', ['ADMIN']));
    failing = false;
    await track('7', ['ADMIN']);
    assert.equal(touches, 2);
  });

  it('solo toca al usuario indicado', async () => {
    const { admins, repository } = makeRecipients();
    const track = makeTrackAdminRecipient({ recipients: repository });
    await track('7', ['ADMIN']);
    await track('8', ['USER']);
    assert.deepEqual([...admins], ['7']);
  });
});

describe('adaptador Postgres de admin_recipients', () => {
  const capture = () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = { query: async (sql: string, params: unknown[]) => { calls.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: [], rowCount: 0 }; } };
    return { calls, repository: makePostgresAdminRecipientRepository(db as never) };
  };

  it('touch(admin) hace upsert limitado a una escritura por hora', async () => {
    const { calls, repository } = capture();
    await repository.touch('7', true);
    assert.match(calls[0].sql, /INSERT INTO admin_recipients/);
    assert.match(calls[0].sql, /last_seen_at < now\(\) - interval '1 hour'/);
    assert.deepEqual(calls[0].params, ['7']);
  });

  it('touch(no admin) borra la fila', async () => {
    const { calls, repository } = capture();
    await repository.touch('7', false);
    assert.match(calls[0].sql, /DELETE FROM admin_recipients WHERE user_id = \$1/);
  });
});

describe('middleware trackAdmin en las rutas', () => {
  const authMiddleware = makeAuthMiddleware({
    sign: () => 'unused-test-value',
    verify: token => {
      if (token === 'admin') return { userId: 7, email: 'a@example.test', roles: ['ADMIN'], permissions: [] };
      if (token === 'user') return { userId: 8, email: 'u@example.test', roles: ['USER'], permissions: [] };
      throw new Error('token invalido');
    },
  });

  const call = (router: unknown, url: string, token?: string): Promise<{ status: number; body: any }> =>
    new Promise((resolve, reject) => {
      const out = { status: 200, body: undefined as unknown };
      const res = {
        status: (status: number) => { out.status = status; return res; },
        json: (value: unknown) => { out.body = value; resolve(out); return res; },
      };
      (router as { handle: (...args: unknown[]) => void }).handle(
        { method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {}, query: {}, body: undefined },
        res as unknown as Response,
        (error?: unknown) => reject(error ?? new Error('Ruta no atendida')),
      );
    });

  const routesWith = (trackAdmin?: (userId: string, roles: readonly string[]) => Promise<void>) =>
    makeProfileRoutes({
      authMiddleware,
      trackAdmin,
      useCases: {
        getProfile: async () => ({ userId: 'x' }),
        listNotifications: async () => ({ items: [], total: 0, unreadCount: 0 }),
      } as never,
    });

  it('registra al admin en /me y en /notifications y deja pasar la peticion', async () => {
    const { admins, repository } = makeRecipients();
    const { profile, notifications } = routesWith(makeTrackAdminRecipient({ recipients: repository }));

    const me = await call(profile, '/me', 'admin');
    assert.equal(me.status, 200);
    assert.deepEqual([...admins], ['7']);

    admins.clear();
    const list = await call(notifications, '/', 'admin');
    assert.equal(list.status, 200);
    // El mismo usuario y rol ya estan en cache: no vuelve a escribir.
    assert.deepEqual([...admins], []);
  });

  it('un usuario sin ADMIN no se registra y un admin degradado se quita', async () => {
    const { admins, repository } = makeRecipients();
    admins.add('8');
    const { profile } = routesWith(makeTrackAdminRecipient({ recipients: repository }));
    await call(profile, '/me', 'user');
    assert.equal(admins.has('8'), false);
  });

  it('si el repositorio lanza un error, la peticion no se bloquea', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const { profile } = routesWith(makeTrackAdminRecipient({
        recipients: { touch: async () => { throw new Error('db caida'); }, listActive: async () => [] },
      }));
      const response = await call(profile, '/me', 'admin');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { userId: 'x' });
    } finally {
      console.error = original;
    }
  });

  it('sin token responde 401 y no registra nada', async () => {
    const touched: string[] = [];
    const { profile } = routesWith(async userId => { touched.push(userId); });
    const response = await call(profile, '/me');
    assert.equal(response.status, 401);
    assert.deepEqual(touched, []);
  });

  it('sin trackAdmin configurado las rutas funcionan igual', async () => {
    const { profile } = routesWith(undefined);
    assert.equal((await call(profile, '/me', 'admin')).status, 200);
  });
});

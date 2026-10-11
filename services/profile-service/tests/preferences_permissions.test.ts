import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Response } from 'express';
import { makeAuthMiddleware, PERMISSIONS } from '@traduce/shared';
import { makeProfileRoutes } from '../src/adapters/inbound/http/routes';
import { makeGetProfile } from '../src/application/get_profile';
import { makeGetPreferences, makeUpdatePreferences } from '../src/application/preferences';
import { DEFAULT_PREFERENCES, Preferences } from '../src/domain/preferences';
import { ProfileRepository } from '../src/ports/repositories';
import {
  makePostgresProfileRepository, Queryable,
} from '../src/adapters/outbound/postgres/postgres_repositories';

// Identidades simuladas: no se generan ni se leen tokens reales.
const identities = {
  user: { userId: 7, email: 'user@example.test', roles: ['USER'], permissions: [] },
  linguist: { userId: 7, email: 'linguist@example.test', roles: ['LINGUIST'], permissions: [] },
  adminWithoutPermission: { userId: 7, email: 'admin@example.test', roles: ['ADMIN'], permissions: [] },
  admin: {
    userId: 7, email: 'admin@example.test', roles: ['ADMIN'],
    permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
  },
};

const authMiddleware = makeAuthMiddleware({
  sign: () => 'unused-test-value',
  verify: identity => {
    const user = identities[identity as keyof typeof identities];
    if (!user) throw new Error('Identidad simulada inválida');
    return user;
  },
});

const call = (
  router: unknown,
  method: string,
  url: string,
  identity?: keyof typeof identities,
  body?: unknown,
): Promise<{ status: number; body: any }> =>
  new Promise((resolve, reject) => {
    const out = { status: 200, body: undefined as unknown };
    const res = {
      status: (status: number) => { out.status = status; return res; },
      json: (value: unknown) => {
        out.body = value;
        resolve(out);
        return res;
      },
    };
    (router as { handle: (...args: unknown[]) => void }).handle(
      {
        method, url,
        headers: identity ? { authorization: `Bearer ${identity}` } : {},
        query: {}, body,
      },
      res as unknown as Response,
      (error?: unknown) => reject(error ?? new Error('Ruta no atendida')),
    );
  });

const setup = () => {
  const state = new Map<string, Preferences>([
    ['7', { ...DEFAULT_PREFERENCES }],
    ['8', { ...DEFAULT_PREFERENCES }],
  ]);
  const updatedUsers: string[] = [];
  const published: unknown[] = [];
  const profiles: ProfileRepository = {
    createIfAbsent: async () => {},
    findProfile: async userId => {
      const preferences = state.get(userId);
      return preferences ? { userId, fullName: 'Cuenta de prueba', preferences } : null;
    },
    findPreferences: async userId => state.get(userId) ?? null,
    updatePreferences: async (userId, patch) => {
      const current = state.get(userId);
      if (!current) return null;
      const next = { ...current, ...patch };
      updatedUsers.push(userId);
      state.set(userId, next);
      return next;
    },
  };

  const { profile } = makeProfileRoutes({
    authMiddleware,
    useCases: {
      getProfile: makeGetProfile({ profiles }),
      getPreferences: makeGetPreferences({ profiles }),
      updatePreferences: makeUpdatePreferences({
        profiles,
        eventPublisher: {
          publish: async (_type, payload) => { published.push(payload); },
        },
      }),
      listAchievements: async () => [],
      listNotifications: async () => ({ items: [], total: 0, unreadCount: 0 }),
      markNotificationRead: async () => { throw new Error('No usado'); },
    },
  });
  return { router: profile, state, updatedUsers, published };
};

for (const path of ['/preferences', '/me']) {
  describe(`PATCH /api/profile${path}`, () => {
    it('sin autenticación responde 401 y no escribe', async () => {
      const test = setup();
      const result = await call(test.router, 'PATCH', path, undefined, {
        notificationsEnabled: false,
      });
      assert.equal(result.status, 401);
      assert.deepEqual(test.updatedUsers, []);
    });

    it('USER y LINGUIST pueden cambiar tema e idioma sin cambiar avisos', async () => {
      for (const identity of ['user', 'linguist'] as const) {
        const test = setup();
        const result = await call(test.router, 'PATCH', path, identity, {
          theme: 'DARK', uiLanguage: 'EN',
        });
        assert.equal(result.status, 200);
        assert.deepEqual(test.state.get('7'), {
          theme: 'DARK', uiLanguage: 'EN', notificationsEnabled: true,
        });
        assert.deepEqual(test.state.get('8'), DEFAULT_PREFERENCES);
      }
    });

    it('rechaza true y false sin permiso, incluso con rol ADMIN', async () => {
      for (const identity of ['user', 'linguist', 'adminWithoutPermission'] as const) {
        for (const notificationsEnabled of [true, false]) {
          const test = setup();
          const result = await call(test.router, 'PATCH', path, identity, {
            theme: 'DARK', notificationsEnabled,
            permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
            roles: ['ADMIN'],
          });
          assert.equal(result.status, 403);
          assert.equal(result.body.code, 'FORBIDDEN');
          assert.deepEqual(test.state.get('7'), DEFAULT_PREFERENCES);
          assert.deepEqual(test.updatedUsers, []);
          assert.deepEqual(test.published, []);
        }
      }
    });

    it('ADMIN con permiso cambia solo sus propios avisos', async () => {
      for (const notificationsEnabled of [true, false]) {
        const test = setup();
        const result = await call(test.router, 'PATCH', path, 'admin', {
          notificationsEnabled, userId: '8',
        });
        assert.equal(result.status, 200);
        assert.equal(test.state.get('7')?.notificationsEnabled, notificationsEnabled);
        assert.deepEqual(test.state.get('8'), DEFAULT_PREFERENCES);
        assert.deepEqual(test.updatedUsers, ['7']);
        assert.deepEqual(test.published, [{ userId: '7', notificationsEnabled }]);

        const read = await call(test.router, 'GET', '/preferences?userId=8', 'admin');
        assert.equal(read.body.notificationsEnabled, notificationsEnabled);
        if (path === '/me') assert.equal(result.body.userId, '7');
      }
    });

    it('un valor inválido exige permiso y después devuelve 400', async () => {
      for (const notificationsEnabled of [null, 'false', undefined]) {
        const denied = setup();
        const result = await call(denied.router, 'PATCH', path, 'user', {
          notificationsEnabled,
        });
        assert.equal(result.status, 403);
        assert.deepEqual(denied.updatedUsers, []);
      }

      const allowed = setup();
      const result = await call(allowed.router, 'PATCH', path, 'admin', {
        notificationsEnabled: 'false',
      });
      assert.equal(result.status, 400);
      assert.equal(result.body.code, 'VALIDATION_ERROR');
      assert.deepEqual(allowed.updatedUsers, []);
    });
  });
}

describe('aislamiento del repositorio PostgreSQL', () => {
  it('el UPDATE filtra por el identificador del actor', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const db: Queryable = {
      async query(text, values) {
        queries.push({ text, values });
        return { rows: [], rowCount: 0 };
      },
    };
    await makePostgresProfileRepository(db).updatePreferences('7', {
      notificationsEnabled: false,
    });
    assert.equal(queries.length, 1);
    assert.match(queries[0].text, /WHERE user_id = \$1/);
    assert.deepEqual(queries[0].values, ['7', false]);
  });
});
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Response } from 'express';
import { makeAuthMiddleware, PERMISSIONS } from '@traduce/shared';
import { makeProfileRoutes } from '../src/adapters/inbound/http/routes';
import { makeGetProfile } from '../src/application/get_profile';
import {
  makeGetPreferences,
  makeUpdatePreferences,
} from '../src/application/preferences';
import { DEFAULT_PREFERENCES } from '../src/domain/preferences';
import { ProfileRepository } from '../src/ports/repositories';
import { makeInMemoryStore } from './in_memory';
import {
  makePostgresProfileRepository,
  Queryable,
} from '../src/adapters/outbound/postgres/postgres_repositories';

// Identidades simuladas: no se generan ni se leen tokens reales.
// El rol ADMIN por sí solo no concede el permiso de gestionar avisos.
const identities = {
  user: {
    userId: 7,
    email: 'user@example.test',
    roles: ['USER'],
    permissions: [],
  },
  linguist: {
    userId: 7,
    email: 'linguist@example.test',
    roles: ['LINGUIST'],
    permissions: [],
  },
  adminWithoutPermission: {
    userId: 7,
    email: 'admin@example.test',
    roles: ['ADMIN'],
    permissions: [],
  },
  admin: {
    userId: 7,
    email: 'admin@example.test',
    roles: ['ADMIN'],
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

// Ejecuta el router con petición y respuesta simuladas, sin abrir un servidor.
// Los objetos pueden contener undefined para comprobar presencia de campos;
// ese valor no se transporta en una petición JSON real.
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
      status: (status: number) => {
        out.status = status;
        return res;
      },
      json: (value: unknown) => {
        out.body = value;
        resolve(out);
        return res;
      },
    };

    (router as { handle: (...args: unknown[]) => void }).handle(
      {
        method,
        url,
        headers: identity ? { authorization: `Bearer ${identity}` } : {},
        query: {},
        body,
      },
      res as unknown as Response,
      (error?: unknown) =>
        reject(error ?? new Error('Ruta no atendida')),
    );
  });

// Cada prueba tiene un almacén independiente.
// Perfil y preferencias se preparan por separado para representar filas faltantes.
// La cuenta 8 permite comprobar que las operaciones de la cuenta 7 están aisladas.
const setup = () => {
  const store = makeInMemoryStore([]);

  for (const userId of ['7', '8']) {
    store.profilesByUser.set(userId, {
      userId,
      fullName: 'Cuenta de prueba',
    });
    store.preferencesByUser.set(userId, { ...DEFAULT_PREFERENCES });
  }

  const updatedUsers: string[] = [];
  const published: unknown[] = [];

  const profiles: ProfileRepository = {
    ...store.repositories.profiles,
    updatePreferences: async (userId, patch) => {
      const updated = await store.repositories.profiles.updatePreferences(
        userId,
        patch,
      );
      if (updated) updatedUsers.push(userId);
      return updated;
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
          publish: async (_type, payload) => {
            published.push(payload);
          },
        },
      }),
      listAchievements: async () => [],
      listNotifications: async () => ({
        items: [],
        total: 0,
        unreadCount: 0,
      }),
      markNotificationRead: async () => {
        throw new Error('No usado');
      },
    },
  });

  return {
    router: profile,
    state: store.preferencesByUser,
    profilesByUser: store.profilesByUser,
    updatedUsers,
    published,
  };
};

// Ambos endpoints comparten la actualización de preferencias.
// Se ejecutan las mismas comprobaciones sobre cada ruta para evitar diferencias.
for (const path of ['/preferences', '/me']) {
  describe(`PATCH /api/profile${path}`, () => {
    it('sin autenticación responde 401 y no escribe', async () => {
      const test = setup();
      const result = await call(
        test.router,
        'PATCH',
        path,
        undefined,
        { notificationsEnabled: false },
      );

      assert.equal(result.status, 401);
      assert.deepEqual(test.updatedUsers, []);
      assert.deepEqual(test.published, []);
    });

    it('USER y LINGUIST pueden cambiar tema e idioma sin cambiar avisos', async () => {
      for (const identity of ['user', 'linguist'] as const) {
        const test = setup();
        const result = await call(test.router, 'PATCH', path, identity, {
          theme: 'DARK',
          uiLanguage: 'EN',
        });

        assert.equal(result.status, 200);

        // La fecha se comprueba aparte porque la genera el doble al actualizar.
        const { updatedAt, ...preferences } = test.state.get('7')!;
        assert.deepEqual(preferences, {
          theme: 'DARK',
          uiLanguage: 'EN',
          notificationsEnabled: true,
        });
        assert.ok(updatedAt);
        assert.deepEqual(test.state.get('8'), DEFAULT_PREFERENCES);
      }
    });

    it('rechaza true y false sin permiso, incluso con rol ADMIN', async () => {
      for (const identity of [
        'user',
        'linguist',
        'adminWithoutPermission',
      ] as const) {
        for (const notificationsEnabled of [true, false]) {
          const test = setup();
          const result = await call(test.router, 'PATCH', path, identity, {
            theme: 'DARK',
            notificationsEnabled,
            permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
            roles: ['ADMIN'],
          });

          // Los roles y permisos enviados en el body no conceden autorización.
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
          notificationsEnabled,
          userId: '8',
        });

        assert.equal(result.status, 200);
        assert.equal(
          test.state.get('7')?.notificationsEnabled,
          notificationsEnabled,
        );
        assert.deepEqual(test.state.get('8'), DEFAULT_PREFERENCES);
        assert.deepEqual(test.updatedUsers, ['7']);
        assert.deepEqual(test.published, [{
          userId: '7',
          notificationsEnabled,
        }]);

        const read = await call(
          test.router,
          'GET',
          '/preferences?userId=8',
          'admin',
        );

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
        assert.deepEqual(denied.published, []);
      }

      const allowed = setup();
      const result = await call(allowed.router, 'PATCH', path, 'admin', {
        notificationsEnabled: 'false',
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.code, 'VALIDATION_ERROR');
      assert.deepEqual(allowed.updatedUsers, []);
      assert.deepEqual(allowed.published, []);
    });

    // Un PATCH parcial conserva lo que no se envió, incluido un false existente.
    it('conserva campos omitidos, incluido false', async () => {
      const test = setup();
      test.state.set('7', {
        uiLanguage: 'EN',
        theme: 'LIGHT',
        notificationsEnabled: false,
      });

      const result = await call(test.router, 'PATCH', path, 'user', {
        theme: 'DARK',
      });

      assert.equal(result.status, 200);

      const preferences = path === '/me'
        ? result.body.preferences
        : result.body;

      assert.equal(preferences.theme, 'DARK');
      assert.equal(preferences.uiLanguage, 'EN');
      assert.equal(preferences.notificationsEnabled, false);
      assert.deepEqual(test.state.get('8'), DEFAULT_PREFERENCES);
      assert.deepEqual(test.published, [{ userId: '7', theme: 'DARK' }]);
    });

    // Si existe el perfil, guardar puede reparar únicamente sus preferencias.
    // Los campos omitidos toman los defaults; la identidad permanece intacta.
    it('repara preferencias con defaults sin modificar identidad', async () => {
      const test = setup();
      test.state.delete('7');

      const result = await call(test.router, 'PATCH', path, 'user', {
        theme: 'DARK',
      });

      assert.equal(result.status, 200);

      const preferences = path === '/me'
        ? result.body.preferences
        : result.body;

      assert.equal(preferences.theme, 'DARK');
      assert.equal(preferences.uiLanguage, 'ES');
      assert.equal(preferences.notificationsEnabled, true);
      assert.equal(test.state.size, 2);
      assert.deepEqual(test.profilesByUser.get('7'), {
        userId: '7',
        fullName: 'Cuenta de prueba',
      });
      assert.deepEqual(test.state.get('8'), DEFAULT_PREFERENCES);
      assert.deepEqual(test.updatedUsers, ['7']);
      assert.deepEqual(test.published, [{ userId: '7', theme: 'DARK' }]);
    });

    // No se fabrica un perfil desde PATCH, aunque existan preferencias huérfanas.
    for (const orphanPreferences of [false, true]) {
      it(`sin perfil devuelve 404; preferencias huérfanas=${orphanPreferences}`, async () => {
        const test = setup();
        test.profilesByUser.delete('7');
        if (!orphanPreferences) test.state.delete('7');

        const result = await call(test.router, 'PATCH', path, 'user', {
          theme: 'DARK',
        });

        assert.equal(result.status, 404);
        assert.equal(test.profilesByUser.has('7'), false);
        assert.deepEqual(
          test.state.get('7'),
          orphanPreferences ? DEFAULT_PREFERENCES : undefined,
        );
        assert.deepEqual(test.updatedUsers, []);
        assert.deepEqual(test.published, []);
      });
    }

    // La reparación no permite saltarse autenticación ni autorización.
    // La presencia de notificationsEnabled exige permiso, incluso para false.
    it('exige autenticación y permiso antes de reparar', async () => {
      for (const identity of [
        undefined,
        'user',
        'linguist',
        'adminWithoutPermission',
      ] as const) {
        for (const notificationsEnabled of [false, true, null, undefined]) {
          const test = setup();
          test.state.delete('7');

          const result = await call(test.router, 'PATCH', path, identity, {
            theme: 'DARK',
            notificationsEnabled,
          });

          assert.equal(result.status, identity === undefined ? 401 : 403);
          assert.equal(test.state.has('7'), false);
          assert.deepEqual(test.updatedUsers, []);
          assert.deepEqual(test.published, []);
        }
      }
    });

    it('con permiso repara y persiste false', async () => {
      const test = setup();
      test.state.delete('7');

      const result = await call(test.router, 'PATCH', path, 'admin', {
        notificationsEnabled: false,
      });

      assert.equal(result.status, 200);

      const preferences = path === '/me'
        ? result.body.preferences
        : result.body;

      assert.equal(preferences.notificationsEnabled, false);
      assert.equal(preferences.uiLanguage, 'ES');
      assert.equal(preferences.theme, 'LIGHT');
      assert.deepEqual(test.state.get('8'), DEFAULT_PREFERENCES);
      assert.deepEqual(test.updatedUsers, ['7']);
      assert.deepEqual(test.published, [{
        userId: '7',
        notificationsEnabled: false,
      }]);
    });

    // Los datos inválidos no deben provocar inserciones ni publicaciones.
    it('rechaza patches vacíos o inválidos antes de escribir', async () => {
      for (const body of [
        {},
        undefined,
        { theme: undefined },
        { theme: 'INVALID' },
      ]) {
        const test = setup();
        test.state.delete('7');

        const result = await call(test.router, 'PATCH', path, 'user', body);

        assert.equal(result.status, 400);
        assert.equal(test.state.has('7'), false);
        assert.deepEqual(test.updatedUsers, []);
        assert.deepEqual(test.published, []);
      }
    });

    it('omite undefined antes de llamar al repositorio', async () => {
      const test = setup();
      const result = await call(test.router, 'PATCH', path, 'user', {
        theme: 'DARK',
        uiLanguage: undefined,
      });

      assert.equal(result.status, 200);
      assert.equal(test.state.get('7')?.uiLanguage, 'ES');
      assert.deepEqual(test.published, [{ userId: '7', theme: 'DARK' }]);
    });

    // GET conserva su contrato: ofrece defaults sin escribir filas faltantes.
    it('GET sigue siendo una lectura sin reparación', async () => {
      const test = setup();
      test.state.delete('7');

      const result = await call(test.router, 'GET', path, 'user');

      assert.equal(result.status, 200);
      assert.deepEqual(
        path === '/me' ? result.body.preferences : result.body,
        DEFAULT_PREFERENCES,
      );
      assert.equal(test.state.has('7'), false);
      assert.deepEqual(test.updatedUsers, []);
      assert.deepEqual(test.published, []);
    });
  });
}

// Inspecciona el SQL y sus parámetros mediante un Queryable simulado.
// No ejecuta PostgreSQL ni demuestra atomicidad, rollback o concurrencia.
describe('construcción de SQL del repositorio', () => {
  it('exige el perfil del actor y parametriza false', async () => {
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
    assert.match(queries[0].text, /FROM user_profiles p/);
    assert.match(queries[0].text, /WHERE p\.user_id = \$1/);
    assert.match(queries[0].text, /\$2::boolean/);
    assert.match(queries[0].text, /ON CONFLICT \(user_id\) DO UPDATE/);
    assert.match(
      queries[0].text,
      /notifications_enabled = EXCLUDED\.notifications_enabled/,
    );
    assert.deepEqual(queries[0].values, ['7', false]);
  });
});
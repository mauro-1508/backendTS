import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePreferencesPatch } from '../src/application/preferences';
import { parseNotificationQuery } from '../src/application/notifications';
import { ProfileError } from '../src/domain/errors';

describe('validacion de entradas', () => {
  it('acepta tema, idioma y notificaciones validos', () => {
    assert.deepEqual(
      parsePreferencesPatch({ theme: 'DARK', uiLanguage: 'EN', notificationsEnabled: false, otro: 1 }),
      { theme: 'DARK', uiLanguage: 'EN', notificationsEnabled: false },
    );
  });

  it('rechaza valores invalidos y cuerpos vacios con 400', () => {
    for (const body of [{ theme: 'RED' }, { uiLanguage: 'FR' }, { notificationsEnabled: 'si' }, {}, undefined]) {
      assert.throws(() => parsePreferencesPatch(body), (e: unknown) => e instanceof ProfileError && e.httpStatus === 400);
    }
  });

  it('pagina notificaciones con valores por defecto y tope de limit', () => {
    assert.deepEqual(parseNotificationQuery({}), { page: 1, limit: 20, unreadOnly: false });
    assert.equal(parseNotificationQuery({ limit: '9999' }).limit, 100);
    assert.throws(() => parseNotificationQuery({ page: '0' }));
  });
});

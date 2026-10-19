import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { missingMailerSettings } from '../../../src/auth/adapters/outbound/mailer/mailer';

describe('missingMailerSettings', () => {
  test('configuracion completa: no falta nada', () => {
    assert.deepEqual(missingMailerSettings({ service: 'gmail', user: 'a@gmail.com', pass: 'secreto' }), []);
  });

  test('sin usuario ni contrasena: faltan las dos', () => {
    assert.deepEqual(missingMailerSettings({ service: 'gmail', user: undefined, pass: undefined }), ['EMAIL_USER', 'EMAIL_PASS']);
  });

  test('cadena vacia cuenta como faltante', () => {
    assert.deepEqual(missingMailerSettings({ service: 'gmail', user: 'a@gmail.com', pass: '' }), ['EMAIL_PASS']);
  });
});

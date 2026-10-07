import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { passwordResetEmail, verificationEmail } from '../../../src/auth/adapters/outbound/mailer/templates';

describe('plantillas de correo', () => {
  test('escapa el nombre', () => {
    const { html } = passwordResetEmail({ name: '<a href=x>', code: '123456' });
    assert.ok(!html.includes('<a href=x>'));
    assert.ok(html.includes('&lt;a href=x&gt;'));
    assert.ok(html.includes('123456'));
  });

  test('la de verificacion tambien escapa', () => {
    assert.ok(!verificationEmail({ name: '"><script>', code: '000001' }).html.includes('<script>'));
  });
});

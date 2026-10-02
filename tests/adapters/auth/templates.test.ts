import { describe, expect, it } from 'vitest';
import { passwordResetEmail, verificationEmail } from '../../../src/domains/auth/adapters/outbound/mailer/templates';

describe('plantillas de correo', () => {
  it('escapa el nombre', () => {
    const { html } = passwordResetEmail({ name: '<a href=x>', code: '123456' });
    expect(html).not.toContain('<a href=x>');
    expect(html).toContain('&lt;a href=x&gt;');
    expect(html).toContain('123456');
  });
  it('la de verificacion tambien escapa', () => {
    expect(verificationEmail({ name: '"><script>', code: '000001' }).html).not.toContain('<script>');
  });
});

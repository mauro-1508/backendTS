export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const codeEmail = (title: string, intro: string, greeting: string, code: string) => `
  <h2>${title}</h2>
  <p>${greeting}, ${intro}</p>
  <h1 style="letter-spacing:8px;color:#3B82F6;">${escapeHtml(code)}</h1>
  <p>Este código expira en <strong>15 minutos</strong>.</p>
  <p>Si no solicitaste esto, ignora este correo.</p>
`;

export const passwordResetEmail = ({ name, code }: { name: string; code: string }) => ({
  subject: 'Código de recuperación - TraduceSeñas',
  html: codeEmail('Recuperar contraseña', 'tu código de verificación es:', `Hola ${escapeHtml(name)}`, code),
});

export const verificationEmail = ({ code }: { name?: string; code: string }) => ({
  subject: 'Verifica tu correo - TraduceSeñas',
  html: codeEmail('Verificar correo', 'tu código para verificar tu correo es:', 'Hola', code),
});

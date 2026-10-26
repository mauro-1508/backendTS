import { UiLanguage } from '../../../domain/preferences';

const BRAND = 'TraduceSeñas';
// Mismos tonos que la app (PrimaryScale del frontend).
const PRIMARY = '#9B77E6';
const PRIMARY_DARK = '#7E5AD0';
const PRIMARY_SOFT = '#F4F1FC';
const TEXT = '#1F2937';
const MUTED = '#6B7280';

// Todos los avisos por correo son reportes de administracion: el boton lleva al panel.
const ADMIN_PATH = '/admin';
// Icono que ya publica la web (frontend public/icons); se pide por URL para no adjuntarlo en cada correo.
const LOGO_PATH = '/icons/icon-192.png';

interface EmailTexts {
  kicker: string;
  button: string;
  appHint: string;
  footer: string;
}

const TEXTS: Record<UiLanguage, EmailTexts> = {
  ES: {
    kicker: 'Aviso para administradores',
    button: 'Ir a mirar',
    appHint: 'En el celular también puedes revisarlo desde la app TraduceSeñas, en la pestaña Administración.',
    footer: 'Recibes este correo porque tienes las notificaciones activadas en TraduceSeñas.',
  },
  EN: {
    kicker: 'Admin notice',
    button: 'Take a look',
    appHint: 'On your phone you can also check it in the TraduceSeñas app, under the Administration tab.',
    footer: 'You get this email because notifications are turned on in TraduceSeñas.',
  },
  FR: {
    kicker: 'Avis aux administrateurs',
    button: 'Aller voir',
    appHint: 'Sur votre téléphone, vous pouvez aussi le consulter dans l’app TraduceSeñas, onglet Administration.',
    footer: 'Vous recevez cet e-mail car les notifications sont activées dans TraduceSeñas.',
  },
  PT: {
    kicker: 'Aviso para administradores',
    button: 'Ir ver',
    appHint: 'No celular você também pode conferir no app TraduceSeñas, na aba Administração.',
    footer: 'Você recebe este e-mail porque as notificações estão ativadas no TraduceSeñas.',
  },
};

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const siteUrl = (appUrl: string, path: string): string => `${appUrl.replace(/\/+$/, '')}${path}`;

/** Enlace al panel de administracion de la web, sin barra doble si APP_URL ya termina en "/". */
export const adminLink = (appUrl: string): string => siteUrl(appUrl, ADMIN_PATH);

/**
 * El cuerpo del aviso es texto plano: se escapa y cada salto de linea se vuelve un parrafo.
 * Maquetado con tablas y estilos en linea porque Gmail y Outlook ignoran <style> y flexbox.
 */
export const notificationEmail = (input: { title: string; body: string; language: UiLanguage; appUrl: string }) => {
  const texts = TEXTS[input.language] ?? TEXTS.ES;
  const href = escapeHtml(adminLink(input.appUrl));
  const logo = escapeHtml(siteUrl(input.appUrl, LOGO_PATH));
  const paragraphs = input.body
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:${TEXT};">${escapeHtml(line)}</p>`)
    .join('');
  const html = `
<div style="margin:0;padding:24px 12px;background:${PRIMARY_SOFT};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background:${PRIMARY};padding:20px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:#ffffff;border-radius:10px;padding:4px;">
              <img src="${logo}" width="40" height="40" alt="${BRAND}" style="display:block;border:0;">
            </td>
            <td style="padding-left:12px;font-size:20px;font-weight:bold;color:#ffffff;">${BRAND}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${PRIMARY_DARK};">${texts.kicker}</p>
        <h1 style="margin:0 0 20px;font-size:22px;line-height:28px;color:${TEXT};">${escapeHtml(input.title)}</h1>
        ${paragraphs}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
          <tr>
            <td style="border-radius:8px;background:${PRIMARY};">
              <a href="${href}"
                 style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">
                ${texts.button}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:13px;line-height:19px;color:${MUTED};">${texts.appHint}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid #E5E7EB;font-size:12px;line-height:18px;color:${MUTED};">${texts.footer}</td>
    </tr>
  </table>
</div>
`;
  return { subject: `${input.title} - ${BRAND}`, html };
};

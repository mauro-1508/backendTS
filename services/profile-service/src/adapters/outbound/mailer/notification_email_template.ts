import { UiLanguage } from '../../../domain/preferences';

const BRAND = 'TraduceSeñas';
const BUTTON_COLOR = '#3B82F6';

const BUTTON_LABEL: Record<UiLanguage, string> = {
  ES: 'Abrir TraduceSeñas',
  EN: 'Open TraduceSeñas',
  FR: 'Ouvrir TraduceSeñas',
  PT: 'Abrir o TraduceSeñas',
};
const FOOTER: Record<UiLanguage, string> = {
  ES: 'Recibes este correo porque tienes las notificaciones activadas en TraduceSeñas.',
  EN: 'You get this email because notifications are turned on in TraduceSeñas.',
  FR: 'Vous recevez cet e-mail car les notifications sont activées dans TraduceSeñas.',
  PT: 'Você recebe este e-mail porque as notificações estão ativadas no TraduceSeñas.',
};

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** El cuerpo del aviso es texto plano: se escapa y cada salto de linea se vuelve un parrafo. */
export const notificationEmail = (input: { title: string; body: string; language: UiLanguage; appUrl: string }) => {
  const paragraphs = input.body
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>`)
    .join('');
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:560px;">
    <h2 style="margin:0 0 16px;">${escapeHtml(input.title)}</h2>
    ${paragraphs}
    <p style="margin:24px 0;">
      <a href="${escapeHtml(input.appUrl)}"
         style="display:inline-block;padding:12px 24px;background:${BUTTON_COLOR};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
        ${BUTTON_LABEL[input.language]}
      </a>
    </p>
    <p style="margin:0;font-size:12px;color:#6B7280;">${FOOTER[input.language]}</p>
  </div>
`;
  return { subject: `${input.title} - ${BRAND}`, html };
};

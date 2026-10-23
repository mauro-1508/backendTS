import nodemailer from 'nodemailer';
import { Mailer } from '../../../ports/outbound/mailer';
import { MailerConfig } from '../../../../config';
import { accountDeletionEmail, passwordResetEmail, verificationEmail } from './templates';

/** Variables de entorno que faltan para poder enviar correos (vacio = configuracion completa). */
export const missingMailerSettings = (config: MailerConfig): string[] => [
  ...(config.user ? [] : ['EMAIL_USER']),
  ...(config.pass ? [] : ['EMAIL_PASS']),
];

export const makeNodemailerMailer = (config: MailerConfig): Mailer & { verify: () => Promise<void> } => {
  const transporter = nodemailer.createTransport({
    service: config.service,
    // Gmail ya usa SMTPS (465); se fija explicito para que nunca se envie en claro.
    secure: true,
    requireTLS: true,
    // Sin esto un SMTP caido cuelga register durante minutos.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    auth: { user: config.user, pass: config.pass },
  });

  const send = async (to: string, { subject, html }: { subject: string; html: string }) => {
    await transporter.sendMail({ from: `"TraduceSeñas" <${config.user}>`, to, subject, html });
  };

  return {
    sendPasswordResetCode: ({ to, name, code }) => send(to, passwordResetEmail({ name, code })),
    sendVerificationCode: ({ to, name, code }) => send(to, verificationEmail({ name, code })),
    sendAccountDeletionCode: ({ to, name, code }) => send(to, accountDeletionEmail({ name, code })),
    // Prueba conexion y credenciales con el SMTP sin enviar ningun correo.
    verify: async () => {
      await transporter.verify();
    },
  };
};

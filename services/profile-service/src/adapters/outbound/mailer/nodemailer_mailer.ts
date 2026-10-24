import nodemailer from 'nodemailer';
import { Mailer } from '../../../ports/mailer';
import { notificationEmail } from './notification_email_template';

export interface MailerConfig {
  service: string;
  user: string;
  pass: string;
  /** Destino del boton del correo. */
  appUrl: string;
}

export const makeNodemailerMailer = (config: MailerConfig): Mailer & { verify: () => Promise<void> } => {
  const transporter = nodemailer.createTransport({
    service: config.service,
    // Conexion TLS desde el inicio (Gmail, puerto 465).
    secure: true,
    // Sin esto un SMTP caido deja la transaccion del lote abierta durante minutos.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    auth: { user: config.user, pass: config.pass },
  });

  return {
    sendNotification: async ({ to, title, body, language }) => {
      const { subject, html } = notificationEmail({ title, body, language, appUrl: config.appUrl });
      await transporter.sendMail({ from: `"TraduceSeñas" <${config.user}>`, to, subject, html });
    },
    // Prueba conexion y credenciales con el SMTP sin enviar ningun correo.
    verify: async () => {
      await transporter.verify();
    },
  };
};

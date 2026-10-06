import nodemailer from 'nodemailer';
import { Mailer } from '../../../ports/outbound/mailer';
import { MailerConfig } from '../../../../config';
import { passwordResetEmail, verificationEmail } from './templates';

export const makeNodemailerMailer = (config: MailerConfig): Mailer => {
  const transporter = nodemailer.createTransport({
    service: config.service,
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
  };
};

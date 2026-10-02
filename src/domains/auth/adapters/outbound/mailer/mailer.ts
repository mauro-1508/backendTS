import nodemailer from 'nodemailer';
import { Mailer } from '../../../ports/outbound/mailer';
import { config } from '../../../../../shared/config/config';
import { passwordResetEmail, verificationEmail } from './templates';

const transporter = nodemailer.createTransport({
  service: config.mailer.service,
  // Sin esto un SMTP caido cuelga register durante minutos.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
  auth: {
    user: config.mailer.user,
    pass: config.mailer.pass,
  },
});

const send = async (to: string, { subject, html }: { subject: string; html: string }) => {
  await transporter.sendMail({ from: `"Signa App" <${config.mailer.user}>`, to, subject, html });
};

export const nodemailerMailer: Mailer = {
  sendPasswordResetCode: ({ to, name, code }) => send(to, passwordResetEmail({ name, code })),
  sendVerificationCode: ({ to, name, code }) => send(to, verificationEmail({ name, code })),
};

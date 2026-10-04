import nodemailer from 'nodemailer';
import { Mailer } from '../../../ports/outbound/mailer';
import { MailerConfig } from '../../../../config';

export const makeNodemailerMailer = (config: MailerConfig): Mailer => {
  const transporter = nodemailer.createTransport({
    service: config.service,
    auth: { user: config.user, pass: config.pass },
  });

  return {
    sendMail: async ({ to, subject, html }) => {
      await transporter.sendMail({
        from: `"Signa App" <${config.user}>`,
        to,
        subject,
        html,
      });
    },
  };
};

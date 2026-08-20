import nodemailer from 'nodemailer';
import { Mailer } from '../../../ports/outbound/mailer';
import { config } from '../../../../config/config';

const transporter = nodemailer.createTransport({
  service: config.mailer.service,
  auth: {
    user: config.mailer.user,
    pass: config.mailer.pass,
  },
});

export const nodemailerMailer: Mailer = {
  sendMail: async ({ to, subject, html }) => {
    await transporter.sendMail({
      from: `"Signa App" <${config.mailer.user}>`,
      to,
      subject,
      html,
    });
  },
};

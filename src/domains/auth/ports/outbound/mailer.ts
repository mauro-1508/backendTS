export interface Mailer {
  sendMail(params: { to: string; subject: string; html: string }): Promise<void>;
}

export interface Mailer {
  sendPasswordResetCode(params: { to: string; name: string; code: string }): Promise<void>;
  sendVerificationCode(params: { to: string; name: string; code: string }): Promise<void>;
  sendAccountDeletionCode(params: { to: string; name: string; code: string }): Promise<void>;
}

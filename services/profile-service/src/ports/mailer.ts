import { UiLanguage } from '../domain/preferences';

export interface NotificationEmail {
  to: string;
  title: string;
  body: string;
  language: UiLanguage;
}

export interface Mailer {
  sendNotification(email: NotificationEmail): Promise<void>;
}

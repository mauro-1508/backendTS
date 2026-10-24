export type NotificationChannel = 'PUSH' | 'EMAIL' | 'IN_APP';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ' | 'CANCELLED';
export type ReferenceType = 'ACHIEVEMENT' | 'ADMIN_REPORT';
/** Canales que se crean hoy (ADR-007): la campana de la app y el correo. PUSH queda descartado. */
export type DeliveryChannel = Extract<NotificationChannel, 'IN_APP' | 'EMAIL'>;

export const ACHIEVEMENT_NOTIFICATION_TYPE_CODE = 'ACHIEVEMENT_UNLOCKED';
export const ADMIN_WEEKLY_REPORT_TYPE_CODE = 'ADMIN_WEEKLY_REPORT';
export const ADMIN_MONTHLY_REPORT_TYPE_CODE = 'ADMIN_MONTHLY_REPORT';
export const ADMIN_MODEL_REMINDER_TYPE_CODE = 'ADMIN_MODEL_REMINDER';

/** Limite de la columna notifications.title. */
export const MAX_NOTIFICATION_TITLE_LENGTH = 150;

export interface Notification {
  id: string;
  typeId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  referenceType?: ReferenceType;
  referenceId?: string;
  status: NotificationStatus;
  sentAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface NewNotification {
  userId: string;
  typeCode: string;
  /** IN_APP por defecto. EMAIL nace PENDING y lo envia el worker de correo. */
  channel?: DeliveryChannel;
  title: string;
  body: string;
  referenceType?: ReferenceType;
  referenceId?: string;
}

export interface NotificationPage {
  items: Notification[];
  total: number;
  unreadCount: number;
}

export interface NotificationQuery {
  page: number;
  limit: number;
  unreadOnly: boolean;
}

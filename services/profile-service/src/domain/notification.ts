export type NotificationChannel = 'PUSH' | 'EMAIL' | 'IN_APP';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ' | 'CANCELLED';
export type ReferenceType = 'ACHIEVEMENT';

export const ACHIEVEMENT_NOTIFICATION_TYPE_CODE = 'ACHIEVEMENT_UNLOCKED';

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

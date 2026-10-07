import { notFoundError, validationError } from '../domain/errors';
import { Notification, NotificationPage, NotificationQuery } from '../domain/notification';
import { NotificationRepository } from '../ports/repositories';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const positiveInt = (raw: unknown, fallback: number, field: string): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw validationError(`${field} debe ser un entero positivo`);
  return value;
};

export const parseNotificationQuery = (raw: Record<string, unknown>): NotificationQuery => ({
  page: positiveInt(raw.page, DEFAULT_PAGE, 'page'),
  limit: Math.min(positiveInt(raw.limit, DEFAULT_LIMIT, 'limit'), MAX_LIMIT),
  unreadOnly: raw.unreadOnly === 'true',
});

export const makeListNotifications = (deps: { notifications: NotificationRepository }) =>
  (userId: string, query: NotificationQuery): Promise<NotificationPage> =>
    deps.notifications.list(userId, query);

export const makeMarkNotificationRead = (deps: { notifications: NotificationRepository }) =>
  async (userId: string, notificationId: string): Promise<Notification> => {
    // Un id que no es UUID no puede existir: se evita el error de la base.
    const notification = UUID_PATTERN.test(notificationId)
      ? await deps.notifications.markRead(userId, notificationId)
      : null;
    if (!notification) throw notFoundError('Notificación no encontrada');
    return notification;
  };

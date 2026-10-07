import { EVENT_TYPES, EventPublisher, publishQuietly, UserRegistered } from '@traduce/shared';

/** Avisa a los demas servicios (profile, analytics) de una cuenta nueva. Un fallo del broker no rompe el alta. */
export const publishUserRegistered = (
  eventPublisher: EventPublisher,
  user: { userId: number; email: string; name: string },
): Promise<void> => {
  const registered: UserRegistered = { userId: user.userId, email: user.email, name: user.name };
  return publishQuietly(eventPublisher, EVENT_TYPES.UserRegistered, registered);
};

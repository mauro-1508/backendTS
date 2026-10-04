import { EventPublisher } from '@traduce/shared';
import { IAM_EVENTS, UserRegisteredPayload } from '../domain/events';

/**
 * Publica sin romper el registro: el usuario ya existe en la base y no debe
 * recibir un error porque el broker este caido. El fallo queda en el log.
 */
export const publishUserRegistered = async (
  publisher: EventPublisher,
  payload: UserRegisteredPayload,
): Promise<void> => {
  try {
    await publisher.publish(IAM_EVENTS.UserRegistered, payload);
  } catch (error) {
    console.error(`[iam] no se pudo publicar ${IAM_EVENTS.UserRegistered}`, error);
  }
};

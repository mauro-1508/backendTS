import { EventPublisher } from '@traduce/shared';

/** Publica sin romper la operacion: si el broker cae, el fallo queda en el log. */
export const publishQuietly = async (publisher: EventPublisher, type: string, payload: unknown): Promise<void> => {
  try {
    await publisher.publish(type, payload);
  } catch (error) {
    console.error(`[profile] no se pudo publicar ${type}`, error);
  }
};

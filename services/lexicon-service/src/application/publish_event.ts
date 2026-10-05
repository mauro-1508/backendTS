import { EventPublisher } from '@traduce/shared';

/**
 * Publica sin romper la operacion: la seña ya cambio de estado en la base y el
 * cliente no debe recibir un error porque el broker este caido. El fallo queda
 * en el log.
 */
export const publishQuietly = async (publisher: EventPublisher, type: string, payload: unknown): Promise<void> => {
  try {
    await publisher.publish(type, payload);
  } catch (error) {
    console.error(`[lexicon] no se pudo publicar ${type}`, error);
  }
};

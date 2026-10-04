import { EventPublisher } from './event_bus';

/**
 * Publica sin romper la operacion: el cambio ya esta en la base de datos y el cliente
 * no debe recibir un error porque el broker este caido. El fallo queda en el log.
 */
export const publishQuietly = async (publisher: EventPublisher, type: string, payload: unknown): Promise<void> => {
  try {
    await publisher.publish(type, payload);
  } catch (error) {
    console.error(`[events] no se pudo publicar ${type}`, error);
  }
};

import { EventEnvelope, EventHandler, EventSubscriber } from '@traduce/shared';

export const RECOGNITION_EVENTS_QUEUE = 'recognition-service.lexicon-events';
export const LEXICON_EVENTS_PATTERN = 'lexicon.*';
const HANDLED_EVENT_TYPES = ['lexicon.SignPublished', 'lexicon.SignWithdrawn'];

/**
 * Registra los cambios del catalogo de lexicon. Es idempotente: un eventId ya
 * visto (RabbitMQ entrega al menos una vez) se ignora. Por ahora solo deja
 * constancia en el log; cuando el reconocedor cachee el catalogo, aqui se actualiza.
 */
export const makeLexiconEventHandler = (log: (message: string) => void = console.log): EventHandler => {
  const processedEventIds = new Set<string>();

  return async (event: EventEnvelope): Promise<void> => {
    if (!HANDLED_EVENT_TYPES.includes(event.type)) return;
    if (processedEventIds.has(event.eventId)) return;
    processedEventIds.add(event.eventId);
    log(`[recognition] ${event.type} ${JSON.stringify(event.payload)}`);
  };
};

export const subscribeToLexiconEvents = (
  subscriber: EventSubscriber,
  handler: EventHandler = makeLexiconEventHandler(),
): Promise<void> =>
  subscriber.subscribe({ queue: RECOGNITION_EVENTS_QUEUE, pattern: LEXICON_EVENTS_PATTERN }, handler);

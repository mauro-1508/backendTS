import {
  EVENT_TYPES, EventEnvelope, EventHandler, EventSubscriber, isSignPublished, isSignWithdrawn,
  subscribeWithRetry, withValidPayload,
} from '@traduce/shared';

export const RECOGNITION_EVENTS_QUEUE = 'recognition-service.lexicon-events';
export const LEXICON_EVENTS_PATTERN = 'lexicon.*';

/**
 * Registra los cambios del catalogo de lexicon. Es idempotente: un eventId ya
 * visto (RabbitMQ entrega al menos una vez) se ignora, y un payload que no cumple el
 * contrato se descarta con log. Por ahora solo deja constancia en el log; cuando el
 * reconocedor cachee el catalogo, aqui se actualiza.
 */
export const makeLexiconEventHandler = (log: (message: string) => void = console.log): EventHandler => {
  const processedEventIds = new Set<string>();

  const recordOnce = async (event: EventEnvelope): Promise<void> => {
    if (processedEventIds.has(event.eventId)) return;
    processedEventIds.add(event.eventId);
    log(`[recognition] ${event.type} ${JSON.stringify(event.payload)}`);
  };

  const handlersByType: Record<string, EventHandler> = {
    [EVENT_TYPES.SignPublished]: withValidPayload(isSignPublished, recordOnce),
    [EVENT_TYPES.SignWithdrawn]: withValidPayload(isSignWithdrawn, recordOnce),
  };

  return async event => handlersByType[event.type]?.(event);
};

/** No rechaza: si el broker aun no esta arriba reintenta en segundo plano con backoff. */
export const subscribeToLexiconEvents = (
  subscriber: EventSubscriber,
  handler: EventHandler = makeLexiconEventHandler(),
): Promise<void> =>
  subscribeWithRetry(subscriber, { queue: RECOGNITION_EVENTS_QUEUE, pattern: LEXICON_EVENTS_PATTERN }, handler);

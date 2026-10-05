/** Sobre comun de los eventos: `type` es la routing key `<servicio>.<Evento>`. */
export interface EventEnvelope<T = unknown> {
  /** Unico por evento: los consumidores lo usan para ser idempotentes. */
  eventId: string;
  type: string;
  occurredAt: string;
  payload: T;
}

/** Puerto: lexicon solo publica. */
export interface EventPublisher {
  publish(type: string, payload: unknown): Promise<void>;
}

export interface ClosableEventPublisher extends EventPublisher {
  close(): Promise<void>;
}

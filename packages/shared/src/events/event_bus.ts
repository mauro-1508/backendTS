/** Sobre comun de todos los eventos: `type` es la routing key `<servicio>.<Evento>`. */
export interface EventEnvelope<T = unknown> {
  /** Unico por evento: los consumidores lo usan para ser idempotentes. */
  eventId: string;
  type: string;
  occurredAt: string;
  payload: T;
}

export type EventHandler = (event: EventEnvelope) => Promise<void>;

/** Lo unico que necesita quien solo publica. */
export interface PublishOptions {
  /** Id del evento; si falta se genera uno. Permite reintentar el mismo evento (outbox). */
  eventId?: string;
  /**
   * Si ninguna cola recibe el mensaje, publish RECHAZA en vez de descartarlo en silencio.
   * Para eventos que no pueden perderse (outbox). Por defecto false: publicar sin consumidores es normal.
   */
  mandatory?: boolean;
}

export interface EventPublisher {
  publish(type: string, payload: unknown, options?: PublishOptions): Promise<void>;
}

export interface Subscription {
  /** Cola propia del consumidor (cada servicio tiene la suya). */
  queue: string;
  /** Patron de routing key; admite `*` (una palabra) y `#` (cero o mas). */
  pattern: string;
}

export interface EventSubscriber {
  subscribe(subscription: Subscription, handler: EventHandler): Promise<void>;
}

export interface EventBus extends EventPublisher, EventSubscriber {
  close(): Promise<void>;
}

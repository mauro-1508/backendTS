export interface OutboxEvent {
  eventId: string;
  type: string;
  payload: unknown;
  /** Intentos fallidos previos. */
  attempts: number;
  claimToken?: string;
  occurredAt?: string;
}

/**
 * Outbox transaccional: los eventos se escriben junto al cambio de negocio y se publican despues.
 * El relay NO mantiene una transaccion abierta mientras publica: reserva (claim) un lote con una
 * lease, publica fuera de transaccion y registra el resultado de cada evento.
 */
export interface OutboxRepository {
  /** Reserva hasta `limit` eventos vencidos (no publicados, sin lease vigente) por `leaseMs`. */
  claimBatch(limit: number, leaseMs: number): Promise<OutboxEvent[]>;
  markPublished(eventId: string, claimToken?: string): Promise<void>;
  /** Registra el fallo, reprograma el reintento tras `retryAfterMs` y devuelve el total de intentos fallidos. */
  markFailed(eventId: string, error: string, retryAfterMs: number, claimToken?: string): Promise<number>;
  /** Devuelve a la cola, sin penalizar, eventos reservados que no se llegaron a intentar. */
  release(eventIds: string[], claimToken?: string): Promise<void>;
  /** Borra los ya publicados antes de `before`; devuelve cuantos. */
  purgePublishedBefore(before: Date): Promise<number>;
}

/** Lectura para /health: cuantos eventos siguen sin publicar y desde cuando espera el mas viejo. */
export interface OutboxMonitor {
  pendingSummary(): Promise<{ pending: number; oldestPendingAt: Date | null }>;
}

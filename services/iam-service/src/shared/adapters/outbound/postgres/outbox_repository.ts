import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { OutboxEvent, OutboxRepository } from '../../../ports/outbox_repository';

interface OutboxRow {
  event_id: string;
  type: string;
  payload: unknown;
  attempts: number;
  claim_token: string;
}

const MS_PER_SECOND = 1000;

// Una sola sentencia: SKIP LOCKED evita que dos instancias reserven lo mismo y la lease
// (claimed_until) mantiene la reserva despues de terminar la sentencia, sin transaccion abierta.
const CLAIM = `
  UPDATE public.outbox_events SET claimed_until = NOW() + make_interval(secs => $2), claim_token = $3::uuid
  WHERE event_id IN (
    SELECT event_id FROM public.outbox_events
    WHERE published_at IS NULL AND next_attempt_at <= NOW()
      AND (claimed_until IS NULL OR claimed_until < NOW())
    ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED
  )
  RETURNING event_id, type, payload, attempts, created_at, claim_token`;

export const makePostgresOutboxRepository = (pool: Pool): OutboxRepository => ({
  async claimBatch(limit, leaseMs) {
    const { rows } = await pool.query<OutboxRow & { created_at: Date }>(CLAIM, [limit, leaseMs / MS_PER_SECOND, randomUUID()]);
    return rows
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .map((row): OutboxEvent => ({
        claimToken: row.claim_token, occurredAt: row.created_at.toISOString(),
        eventId: row.event_id, type: row.type, payload: row.payload, attempts: row.attempts,
      }));
  },

  async markPublished(eventId, claimToken) {
    await pool.query(
      'UPDATE public.outbox_events SET published_at = NOW(), claimed_until = NULL WHERE event_id = $1 AND claim_token = $2::uuid AND published_at IS NULL',
      [eventId, claimToken],
    );
  },

  async markFailed(eventId, error, retryAfterMs, claimToken) {
    const { rows } = await pool.query<{ attempts: number }>(
      `UPDATE public.outbox_events
       SET attempts = attempts + 1, last_error = $2, claimed_until = NULL,
           next_attempt_at = NOW() + make_interval(secs => $3)
       WHERE event_id = $1 AND claim_token = $4::uuid AND published_at IS NULL RETURNING attempts`,
      [eventId, error, retryAfterMs / MS_PER_SECOND, claimToken],
    );
    return rows[0]?.attempts ?? 0;
  },

  async release(eventIds, claimToken) {
    if (eventIds.length === 0) return;
    await pool.query(
      'UPDATE public.outbox_events SET claimed_until = NULL WHERE event_id = ANY($1::uuid[]) AND claim_token = $2::uuid AND published_at IS NULL',
      [eventIds, claimToken],
    );
  },

  async purgePublishedBefore(before) {
    const result = await pool.query(
      'DELETE FROM public.outbox_events WHERE published_at IS NOT NULL AND published_at < $1',
      [before],
    );
    return result.rowCount ?? 0;
  },
});

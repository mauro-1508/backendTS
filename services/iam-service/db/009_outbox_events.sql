-- Migration 009: outbox transaccional de iam-service (idempotente).
-- Los eventos se escriben aqui en la MISMA transaccion que el cambio de negocio (p. ej. borrar la
-- cuenta) y un relay los publica al broker con confirmacion; asi no se pierden si RabbitMQ falla.
-- (008 queda reservado para la version de sesion.)
--   claimed_until:   reserva temporal del lote por una instancia del relay (se publica fuera de transaccion).
--   next_attempt_at: backoff exponencial entre reintentos de un evento que fallo.

CREATE TABLE IF NOT EXISTS public.outbox_events (
  event_id         UUID PRIMARY KEY,
  type             VARCHAR(100) NOT NULL,
  payload          JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at     TIMESTAMPTZ NULL,
  attempts         INT NOT NULL DEFAULT 0,
  last_error       TEXT NULL,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_until    TIMESTAMPTZ NULL
);

-- Por si una version previa de esta migracion ya se aplico sin estas columnas.
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ NULL;

-- Solo los pendientes: el relay busca aqui y el indice no crece con el historial publicado.
DROP INDEX IF EXISTS public.idx_outbox_events_pending;
CREATE INDEX IF NOT EXISTS idx_outbox_events_due
  ON public.outbox_events (next_attempt_at, created_at)
  WHERE published_at IS NULL;

-- Limpieza de publicados antiguos (published_at).
CREATE INDEX IF NOT EXISTS idx_outbox_events_published
  ON public.outbox_events (published_at)
  WHERE published_at IS NOT NULL;

-- Migration 004: analytics (eventos de uso)
-- Crea usage_events (append-only) con sus 4 indices. Sin tablas de rollup (DATA-03).
-- Ver Docs/06-data/domains/08-usage.md (HU-USG-004, INV-012). Se usa el esquema public
-- e ids SERIAL, igual que users (INT). Es idempotente: se puede ejecutar dos veces.
-- Ejecutar manualmente contra la base de datos `traduce_senas`:
--   psql -h localhost -p 5433 -U postgres -d traduce_senas -f migrations/004_analytics_usage_events.sql

-- SET NULL: el hecho sobrevive a la persona (HU-USG-004).
-- session_id sin FK: sera FK a user_sessions cuando exista esa tabla.
CREATE TABLE IF NOT EXISTS public.usage_events (
  usage_event_id SERIAL PRIMARY KEY,
  user_id        INT NULL,
  session_id     INT NULL,
  section        VARCHAR(30) NOT NULL,
  event_type     VARCHAR(40) NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id   INT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_usage_events_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT chk_usage_events_section CHECK (section IN (
    'HOME', 'TRANSLATION', 'ALPHABET', 'LEXICON', 'HISTORY',
    'PROFILE', 'SETTINGS', 'NOTIFICATIONS', 'ACHIEVEMENTS', 'ADMIN')),
  CONSTRAINT chk_usage_events_type CHECK (event_type IN (
    'SECTION_VIEW', 'TRANSLATION_STARTED', 'TRANSLATION_COMPLETED', 'TRANSLATION_FAILED', 'AUDIO_PLAYED',
    'SIGN_VIEWED', 'SEARCH_PERFORMED', 'HISTORY_ENTRY_DELETED', 'PREFERENCE_CHANGED', 'NOTIFICATION_OPENED')),
  CONSTRAINT chk_usage_events_reference_type CHECK (reference_type IS NULL OR reference_type IN (
    'TRANSLATION', 'SIGN', 'CATEGORY', 'ACHIEVEMENT', 'NOTIFICATION', 'AI_MODEL', 'USER')),
  CONSTRAINT chk_usage_events_reference CHECK ((reference_type IS NULL) = (reference_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_usage_user_created ON public.usage_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_section      ON public.usage_events (section, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_session      ON public.usage_events (session_id);
CREATE INDEX IF NOT EXISTS idx_usage_event_type   ON public.usage_events (event_type, created_at);

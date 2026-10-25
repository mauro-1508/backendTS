-- Migration 005: las traducciones se guardan 30 dias.
-- Una tarea diaria del servicio borra las traducciones mas viejas. Antes de borrarlas suma
-- sus conteos aqui, para que las estadisticas (admin y perfil) no pierdan la historia.
-- Solo guarda numeros y palabras sueltas, nunca el texto ni la hora de cada traduccion.
-- Ejecutar manualmente en un volumen que ya existe:
--   docker compose exec -T postgres-recognition psql -X -v ON_ERROR_STOP=1 -U postgres -d recognition < services/recognition-service/db/005_translation_retention.sql
-- Es idempotente: se puede volver a ejecutar.

-- Traducciones por usuario y dia (hora de Bogota). user_id NULL = traducciones sin usuario.
CREATE TABLE IF NOT EXISTS public.translation_daily_counts (
  user_id INT,  -- id logico de iam-service, sin FK
  day     DATE NOT NULL,
  total   INT  NOT NULL CHECK (total > 0)
);

-- NULLS NOT DISTINCT (Postgres 15+): las traducciones sin usuario tambien suman en una sola fila por dia.
CREATE UNIQUE INDEX IF NOT EXISTS uq_translation_daily_counts_user_day
  ON public.translation_daily_counts (user_id, day) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_translation_daily_counts_day
  ON public.translation_daily_counts (day);

-- Palabras distintas que uso cada usuario (para "palabras distintas" del perfil).
CREATE TABLE IF NOT EXISTS public.translation_user_words (
  user_id INT  NOT NULL,
  word    TEXT NOT NULL,
  PRIMARY KEY (user_id, word)
);

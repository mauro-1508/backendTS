-- Migration 001: translations
-- Crea la tabla translations para persistir las traducciones del usuario.
-- Ejecutar manualmente contra la base de datos `traduce_senas`:
--   psql -h localhost -p 5433 -U postgres -d traduce_senas -f backend/sql/001_translations.sql
--
-- Tipos validos para `type`:
--   - 'texto_sena'  (escritura → seña)
--   - 'sena_texto'  (camara/seña → texto)
--   - 'voz_sena'    (voz → seña)
--
-- Tipos validos para `source` (solo informativo, no se valida):
--   - 'mediapipe' | 'knn' | 'mock' | 'manual'

CREATE TABLE IF NOT EXISTS public.translations (
  translation_id SERIAL PRIMARY KEY,
  user_id        INT REFERENCES public.users(user_id) ON DELETE CASCADE,
  input_text     TEXT NOT NULL,
  output_text    TEXT NOT NULL,
  type           VARCHAR(20) NOT NULL
                 CHECK (type IN ('texto_sena', 'sena_texto', 'voz_sena')),
  confidence     NUMERIC(4,3),
  source         VARCHAR(20),
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_translations_user_id
  ON public.translations(user_id);

CREATE INDEX IF NOT EXISTS idx_translations_created_at
  ON public.translations(created_at DESC);

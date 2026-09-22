-- Migration 002: sign_templates
-- Plantillas de senas que el motor del frontend compara con DTW/KNN.
-- Hasta ahora vivian solo en el AsyncStorage de cada navegador; con esta tabla
-- se comparten entre dispositivos y personas.
-- Ejecutar manualmente contra la base de datos `traduce_senas`:
--   psql -h localhost -p 5433 -U postgres -d traduce_senas -f backend/migrations/002_sign_templates.sql
--
-- Valores de `kind`:
--   - 'static' (abecedario, un frame de 63 valores)
--   - 'motion' (palabras, 16 frames de 63 valores)
--
-- Valores de `source` (informativo):
--   - 'lsc54' (convertidas del dataset publico) | 'manual' (grabadas en la app)

CREATE TABLE IF NOT EXISTS public.sign_templates (
  template_id SERIAL PRIMARY KEY,
  label       VARCHAR(80) NOT NULL,
  kind        VARCHAR(10) NOT NULL CHECK (kind IN ('static', 'motion')),
  features    JSONB NOT NULL,
  source      VARCHAR(20) NOT NULL DEFAULT 'manual',
  created_by  INT REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sign_templates_kind_label
  ON public.sign_templates(kind, label);

CREATE INDEX IF NOT EXISTS idx_sign_templates_source
  ON public.sign_templates(source);

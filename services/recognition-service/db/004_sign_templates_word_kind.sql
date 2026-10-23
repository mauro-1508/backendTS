-- Migration 004: sign_templates acepta kind = 'word'
-- 'word' son las palabras que el admin agrega sin reentrenar el modelo: se
-- graban con el mismo motor que traduce (30 frames de 128 valores, manos y
-- hombros) y la app las compara con DTW antes de preguntarle al modelo.
-- Ejecutar manualmente en un volumen que ya existe:
--   docker compose exec -T postgres-recognition psql -X -v ON_ERROR_STOP=1 -U postgres -d recognition < services/recognition-service/db/004_sign_templates_word_kind.sql
-- Es idempotente: se puede volver a ejecutar.

ALTER TABLE public.sign_templates DROP CONSTRAINT IF EXISTS sign_templates_kind_check;

ALTER TABLE public.sign_templates
  ADD CONSTRAINT sign_templates_kind_check CHECK (kind IN ('static', 'motion', 'word'));

-- Migration 006: estado de la cuenta y verificacion de correo (users.status, users.email_verified_at)
-- 1) status: ACTIVE | INACTIVE (pendiente de verificar el correo) | BLOCKED. Las cuentas nuevas nacen INACTIVE.
-- 2) Cuentas existentes: se dan por confirmadas (ACTIVE) SOLO si su correo tiene formato valido (la 005 ya
--    garantiza que no hay duplicados sin distinguir mayusculas); las de correo con formato invalido quedan
--    INACTIVE y tendran que verificar. email_verified_at queda NULL en todas las existentes: no se inventa
--    una verificacion que nunca ocurrio.
-- Requiere la 005. Idempotente (solo rellena filas con status NULL). Recomendado ejecutar con ON_ERROR_STOP:
--   psql -h localhost -p 5433 -U postgres -d traduce_senas -v ON_ERROR_STOP=1 -f migrations/006_users_status_email_verification.sql

BEGIN;

-- La 005 debe ir antes: sin su constraint se aborta.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_email_normalized' AND conrelid = 'public.users'::regclass) THEN
    RAISE EXCEPTION 'Falta la constraint ck_users_email_normalized: ejecute antes la migracion 005';
  END IF;
END $$;

-- Sin DEFAULT al principio: asi se distinguen las filas existentes (NULL) de las que se creen despues.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status VARCHAR(20);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

UPDATE public.users
SET status = CASE WHEN email ~ '^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$' THEN 'ACTIVE' ELSE 'INACTIVE' END
WHERE status IS NULL;

ALTER TABLE public.users ALTER COLUMN status SET DEFAULT 'INACTIVE';
ALTER TABLE public.users ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_status' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users ADD CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status);

COMMIT;

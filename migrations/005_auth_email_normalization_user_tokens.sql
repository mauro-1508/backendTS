-- Migration 005: correo normalizado + user_tokens (codigos de un solo uso)
-- 1) Unicidad del correo sin distinguir mayusculas: se normaliza (trim + lower) y un CHECK obliga a
--    guardarlo asi; junto al UNIQUE existente (users_email_key) eso da unicidad case-insensitive.
-- 2) Crea public.user_tokens (codigos de verificacion de correo y de recuperacion de contrasena, guardados
--    como hash bcrypt, con contador de intentos). password_reset_token (000) queda sin uso y NO se borra.
-- Si hay correos duplicados salvo mayusculas/espacios, la migracion SE DETIENE con un error y no borra
-- nada: resolverlos a mano y volver a ejecutar. Es idempotente. Recomendado ejecutar con ON_ERROR_STOP:
--   psql -h localhost -p 5433 -U postgres -d traduce_senas -v ON_ERROR_STOP=1 -f migrations/005_auth_email_normalization_user_tokens.sql

BEGIN;

DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT COUNT(*) INTO dup_groups FROM (
    SELECT 1 FROM public.users GROUP BY lower(btrim(email)) HAVING COUNT(*) > 1
  ) d;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION 'Migracion 005 detenida: % correo(s) duplicados salvo mayusculas/espacios en public.users; resolverlos a mano', dup_groups;
  END IF;
END $$;

UPDATE public.users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_email_normalized' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users ADD CONSTRAINT ck_users_email_normalized CHECK (email = lower(btrim(email)));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_tokens (
  token_id   SERIAL PRIMARY KEY,
  user_id    INT NOT NULL,
  token_type VARCHAR(30) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_user_tokens_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
  CONSTRAINT ck_user_tokens_type CHECK (token_type IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')),
  CONSTRAINT ck_user_tokens_attempts CHECK (attempts >= 0)
);

-- Si la tabla ya existia con un esquema anterior, garantiza las columnas usadas por el codigo.
ALTER TABLE public.user_tokens ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.user_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_user_tokens_lookup ON public.user_tokens (user_id, token_type, created_at);

-- A lo sumo un token vivo (ni usado ni revocado) por usuario y tipo, tambien ante emisiones concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_tokens_live ON public.user_tokens (user_id, token_type)
  WHERE used_at IS NULL AND revoked_at IS NULL;

COMMIT;

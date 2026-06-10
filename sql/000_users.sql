-- Migration 000: users + password_reset_token
-- Tablas base de autenticacion que usa el modulo auth del backend.
-- Ejecutar manualmente contra la base de datos `traduce_senas`:
--   psql -h localhost -p 5433 -U postgres -d traduce_senas -f backend/sql/000_users.sql
-- (o via docker: docker exec -i postgres-container psql -U postgres -d traduce_senas < backend/sql/000_users.sql)

CREATE TABLE IF NOT EXISTS public.users (
  user_id           SERIAL PRIMARY KEY,
  name              VARCHAR(120) NOT NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,
  password          VARCHAR(255) NOT NULL,
  terms_accepted    BOOLEAN NOT NULL DEFAULT FALSE,
  terms_accepted_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Tokens de recuperacion de contrasena (flujo forgot/reset password).
CREATE TABLE IF NOT EXISTS public.password_reset_token (
  token_id   SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash
  ON public.password_reset_token(token_hash);

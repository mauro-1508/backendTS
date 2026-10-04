-- Migration 000: esquema base de iam-service (users, role, user_role, password_reset_token).
-- Docker lo aplica solo al crear el volumen de postgres-iam (ver docker-compose.yml).
-- Manualmente contra la base `iam`:
--   psql -h localhost -p 5433 -U postgres -d iam -f services/iam-service/db/000_users.sql
-- Los changelogs de Liquibase (master.xml) son la via alternativa para el mismo esquema.

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

-- Roles y su asignacion a usuarios: el JWT lleva los nombres de rol (p. ej. ADMIN).
CREATE TABLE IF NOT EXISTS public.role (
  role_id     SERIAL PRIMARY KEY,
  name        VARCHAR(100),
  description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS public.user_role (
  user_id INT NOT NULL REFERENCES public.users(user_id),
  role_id INT NOT NULL REFERENCES public.role(role_id),
  PRIMARY KEY (user_id, role_id)
);

-- Roles base: USER se asigna a toda cuenta nueva; ADMIN se otorga a mano.
INSERT INTO public.role (name, description)
SELECT seed.name, seed.description
FROM (VALUES
  ('USER', 'Usuario estandar'),
  ('ADMIN', 'Administrador')
) AS seed(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.role r WHERE r.name = seed.name);

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

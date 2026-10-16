-- Usuarios cuya cuenta se borro en iam-service (evento iam.UserDeleted), idempotente.
-- Impide que una peticion en vuelo o un JWT aun vigente re-cree traducciones de una cuenta ya
-- borrada. Sin FK: user_id es un id logico de iam-service.
CREATE TABLE IF NOT EXISTS public.erased_users (
  user_id   INT          PRIMARY KEY,
  erased_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

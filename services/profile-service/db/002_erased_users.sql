-- Usuarios cuya cuenta se borro en iam-service (evento iam.UserDeleted), idempotente.
-- Un iam.UserRegistered que llegue despues no debe recrear su perfil. Sin FK: user_id es logico.
CREATE TABLE IF NOT EXISTS erased_users (
  user_id   VARCHAR(64)  PRIMARY KEY,
  erased_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

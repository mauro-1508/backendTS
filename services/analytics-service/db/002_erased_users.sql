-- Usuarios cuya cuenta se borro en iam-service (evento iam.UserDeleted), idempotente.
-- Sirve para que un UserRegistered/TranslationProduced que llegue tarde no vuelva a ligar
-- hechos de uso a una persona ya borrada. Sin FK: user_id es un id logico de iam-service.
CREATE TABLE IF NOT EXISTS erased_users (
  user_id   VARCHAR(64)  PRIMARY KEY,
  erased_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

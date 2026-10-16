-- Migration 011: codigo de un solo uso para borrar la cuenta (idempotente).
-- Las cuentas creadas con Google no tienen contraseña: DELETE /users/me se confirma con un codigo
-- enviado al correo (token ACCOUNT_DELETION), con las mismas reglas que los demas codigos
-- (hash, 15 min, 5 intentos, 60 s entre envios y 5 por hora).

ALTER TABLE public.user_tokens DROP CONSTRAINT IF EXISTS ck_user_tokens_type;
ALTER TABLE public.user_tokens ADD CONSTRAINT ck_user_tokens_type
  CHECK (token_type IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ACCOUNT_DELETION'));

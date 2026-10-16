-- Migration 010: las cuentas creadas con Google no tienen contraseña (idempotente).
-- 000_users.sql crea users.password como NOT NULL, asi que POST /auth/google fallaba con 500
-- al crear una cuenta nueva ("null value in column password"). El login con contraseña ya
-- trata password NULL como credenciales invalidas, y forgot-password permite definir una.

ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;

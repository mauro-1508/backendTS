-- Version de los terminos y la politica de datos que la persona acepto al registrarse (Ley 1581).
-- NULL = cuenta creada antes de guardar la version, o por login social sin consentimiento explicito.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);

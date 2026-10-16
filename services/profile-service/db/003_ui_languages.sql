-- Migration 003: idioma de la interfaz tambien en frances y portugues (idempotente).
-- La app ofrece es/en/fr/pt; antes solo ES/EN se guardaban en el servidor y FR/PT quedaban
-- en el dispositivo. Solo amplia los valores permitidos: no cambia ningun dato.

ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_ui_language_check;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_ui_language_check
  CHECK (ui_language IN ('ES', 'EN', 'FR', 'PT'));

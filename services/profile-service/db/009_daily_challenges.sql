-- Retos diarios: usuario lógico de IAM, sin FK entre servicios.
BEGIN;
CREATE TABLE IF NOT EXISTS challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  target_count INTEGER NOT NULL CHECK (target_count > 0),
  points INTEGER NOT NULL CHECK (points >= 0),
  localizations JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS user_challenges (
  user_challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL,
  challenge_date DATE NOT NULL,
  challenge_id UUID NOT NULL REFERENCES challenges(challenge_id) ON DELETE RESTRICT,
  -- Instantánea: cambiar el catálogo no cambia asignaciones existentes.
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  target_count INTEGER NOT NULL CHECK (target_count > 0),
  points INTEGER NOT NULL CHECK (points >= 0),
  localizations JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_count INTEGER NOT NULL DEFAULT 0 CHECK (current_count >= 0 AND current_count <= target_count),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id,challenge_date),
  CHECK ((completed_at IS NOT NULL) = (current_count = target_count))
);
-- Estos puntos son recompensas otorgadas, no los puntos del catálogo ni los de logros.
CREATE TABLE IF NOT EXISTS challenge_rewards (
  user_challenge_id UUID PRIMARY KEY REFERENCES user_challenges(user_challenge_id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_challenge_rewards_user ON challenge_rewards(user_id);
INSERT INTO challenges(code,name,description,target_count,points,localizations) VALUES
  ('TRANSLATE_1','Traducciones guardadas: 1','Guarda y confirma 1 traducciones hoy. Cada traducción guardada cuenta una vez; una frase no cuenta por palabras.',1,5,'{"es": {"name": "Traducciones guardadas: 1", "description": "Guarda y confirma 1 traducciones hoy. Cada traducción guardada cuenta una vez; una frase no cuenta por palabras."}, "en": {"name": "Saved translations: 1", "description": "Save and confirm 1 translations today. Each saved translation counts once; a sentence is not counted by word."}, "fr": {"name": "Traductions enregistrées : 1", "description": "Enregistrez et confirmez 1 traductions aujourd’hui. Chaque traduction enregistrée compte une fois ; les mots d’une phrase ne comptent pas séparément."}, "pt": {"name": "Traduções salvas: 1", "description": "Salve e confirme 1 traduções hoje. Cada tradução salva conta uma vez; uma frase não conta por palavra."}}'::jsonb),
  ('TRANSLATE_3','Traducciones guardadas: 3','Guarda y confirma 3 traducciones hoy. Cada traducción guardada cuenta una vez; una frase no cuenta por palabras.',3,10,'{"es": {"name": "Traducciones guardadas: 3", "description": "Guarda y confirma 3 traducciones hoy. Cada traducción guardada cuenta una vez; una frase no cuenta por palabras."}, "en": {"name": "Saved translations: 3", "description": "Save and confirm 3 translations today. Each saved translation counts once; a sentence is not counted by word."}, "fr": {"name": "Traductions enregistrées : 3", "description": "Enregistrez et confirmez 3 traductions aujourd’hui. Chaque traduction enregistrée compte une fois ; les mots d’une phrase ne comptent pas séparément."}, "pt": {"name": "Traduções salvas: 3", "description": "Salve e confirme 3 traduções hoje. Cada tradução salva conta uma vez; uma frase não conta por palavra."}}'::jsonb),
  ('TRANSLATE_5','Traducciones guardadas: 5','Guarda y confirma 5 traducciones hoy. Cada traducción guardada cuenta una vez; una frase no cuenta por palabras.',5,15,'{"es": {"name": "Traducciones guardadas: 5", "description": "Guarda y confirma 5 traducciones hoy. Cada traducción guardada cuenta una vez; una frase no cuenta por palabras."}, "en": {"name": "Saved translations: 5", "description": "Save and confirm 5 translations today. Each saved translation counts once; a sentence is not counted by word."}, "fr": {"name": "Traductions enregistrées : 5", "description": "Enregistrez et confirmez 5 traductions aujourd’hui. Chaque traduction enregistrée compte une fois ; les mots d’une phrase ne comptent pas séparément."}, "pt": {"name": "Traduções salvas: 5", "description": "Salve e confirme 5 traduções hoje. Cada tradução salva conta uma vez; uma frase não conta por palavra."}}'::jsonb),
  ('TRANSLATE_8','Traducciones guardadas: 8','Guarda y confirma 8 traducciones hoy. Cada traducción guardada cuenta una vez; una frase no cuenta por palabras.',8,25,'{"es": {"name": "Traducciones guardadas: 8", "description": "Guarda y confirma 8 traducciones hoy. Cada traducción guardada cuenta una vez; una frase no cuenta por palabras."}, "en": {"name": "Saved translations: 8", "description": "Save and confirm 8 translations today. Each saved translation counts once; a sentence is not counted by word."}, "fr": {"name": "Traductions enregistrées : 8", "description": "Enregistrez et confirmez 8 traductions aujourd’hui. Chaque traduction enregistrée compte une fois ; les mots d’une phrase ne comptent pas séparément."}, "pt": {"name": "Traduções salvas: 8", "description": "Salve e confirme 8 traduções hoje. Cada tradução salva conta uma vez; uma frase não conta por palavra."}}'::jsonb)
ON CONFLICT(code) DO NOTHING;
INSERT INTO notification_types(code,name,description) VALUES
 ('CHALLENGE_COMPLETED','Reto completado','Aviso al completar un reto diario')
ON CONFLICT(code) DO NOTHING;
COMMIT;

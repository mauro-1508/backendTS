-- Follow-up to applied 004. Preserve all identities and user history.
BEGIN;
ALTER TABLE achievements DROP CONSTRAINT IF EXISTS ck_achievement_legacy_publication;
ALTER TABLE achievements DROP CONSTRAINT IF EXISTS ck_achievement_available_measurement;
ALTER TABLE achievements DROP CONSTRAINT IF EXISTS ck_achievement_activation;
ALTER TABLE achievements DROP CONSTRAINT IF EXISTS ck_achievement_catalog_metadata;
-- Availability describes an implemented rule, not an announcement or a collection.
ALTER TABLE achievements ADD CONSTRAINT ck_achievement_catalog_metadata CHECK (
  collection = 'legacy' OR (category IS NOT NULL AND level IS NOT NULL)
);
UPDATE achievements SET is_active = FALSE, availability = 'upcoming'
WHERE metric <> 'TRANSLATIONS_COMPLETED' OR code = 'firstSign';
-- Inactive available rules can be paused without losing their measured history.
-- Both APIs publish only active, available rules with an implemented counter.
ALTER TABLE achievements ADD CONSTRAINT ck_achievement_available_measurement CHECK (
  availability <> 'available' OR (metric = 'TRANSLATIONS_COMPLETED' AND code <> 'firstSign')
);
ALTER TABLE achievements ADD CONSTRAINT ck_achievement_activation CHECK (
  NOT is_active OR (availability = 'available' AND metric = 'TRANSLATIONS_COMPLETED'
    AND code <> 'firstSign' AND target_count > 0)
);
UPDATE achievements SET localizations = '{"es": {"name": "Primera traducción", "description": "Realiza tu primera traducción de señas"}, "en": {"name": "First translation", "description": "Complete your first sign language translation"}, "fr": {"name": "Première traduction", "description": "Effectue ta première traduction en langue des signes"}, "pt": {"name": "Primeira tradução", "description": "Conclua sua primeira tradução de sinais"}}'::jsonb || localizations WHERE code = 'FIRST_TRANSLATION';
UPDATE achievements SET localizations = '{"es": {"name": "10 traducciones", "description": "Realiza 10 traducciones de señas"}, "en": {"name": "10 translations", "description": "Complete 10 sign language translations"}, "fr": {"name": "10 traductions", "description": "Effectue 10 traductions en langue des signes"}, "pt": {"name": "10 traduções", "description": "Conclua 10 traduções de sinais"}}'::jsonb || localizations WHERE code = 'TEN_TRANSLATIONS';
UPDATE achievements SET localizations = '{"es": {"name": "50 traducciones", "description": "Realiza 50 traducciones de señas"}, "en": {"name": "50 translations", "description": "Complete 50 sign language translations"}, "fr": {"name": "50 traductions", "description": "Effectue 50 traductions en langue des signes"}, "pt": {"name": "50 traduções", "description": "Conclua 50 traduções de sinais"}}'::jsonb || localizations WHERE code = 'FIFTY_TRANSLATIONS';
COMMIT;

-- Apply after 005. Reuse the existing rows, counters and event consumer.
-- No user history, points or historical events are changed or replayed.
-- New progress starts with previously unprocessed TranslationProduced events
-- handled after this transaction activates these rules (including late delivery).
BEGIN;
UPDATE achievements
SET name = '100 traducciones', description = 'Completa 100 traducciones.',
    metric = 'TRANSLATIONS_COMPLETED', target_count = 100,
    availability = 'available', is_active = TRUE,
    localizations = '{"es": {"name": "100 traducciones", "description": "Completa 100 traducciones."}, "en": {"name": "100 translations", "description": "Complete 100 translations."}, "fr": {"name": "100 traductions", "description": "Effectue 100 traductions."}, "pt": {"name": "100 traduções", "description": "Conclua 100 traduções."}}'::jsonb
WHERE code = 'hundredSigns';
UPDATE achievements
SET name = '1.000 traducciones', description = 'Completa 1.000 traducciones.',
    metric = 'TRANSLATIONS_COMPLETED', target_count = 1000,
    availability = 'available', is_active = TRUE,
    localizations = '{"es": {"name": "1.000 traducciones", "description": "Completa 1.000 traducciones."}, "en": {"name": "1,000 translations", "description": "Complete 1,000 translations."}, "fr": {"name": "1 000 traductions", "description": "Effectue 1 000 traductions."}, "pt": {"name": "1.000 traduções", "description": "Conclua 1.000 traduções."}}'::jsonb
WHERE code = 'thousandSigns';
COMMIT;

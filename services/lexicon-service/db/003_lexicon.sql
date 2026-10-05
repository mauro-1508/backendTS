-- Migration 003: lexicon
-- Catalogo de senas (dominio lexicon): categorias, senas (independientes del
-- idioma), sus localizaciones por idioma de interfaz y recursos multimedia.
-- Siembra las 27 letras del alfabeto dactilologico (A-Z + Ñ) con sus modelos
-- 3D, que el backend sirve en /api/lexicon/media (directorio public/lexicon).
--
-- Estado final (todo en el schema public, IDs enteros SERIAL):
--   categories(category_id, name UNIQUE, description, created_at)
--   sign_lexicon(lexicon_id, code UNIQUE, type, letter, language, category_id,
--                is_animated, display_order, status, created_by/updated_by, ...)
--   sign_localizations(sign_localization_id, lexicon_id, ui_language, name,
--                      meaning, description) UNIQUE (lexicon_id, ui_language)
--   multimedia_resource con display_order NOT NULL y UNIQUE por sena.
--
-- Es compatible con tres puntos de partida (y se puede re-ejecutar):
--   a) base vacia;
--   b) tablas legacy de los changelogs 009-011 de Liquibase;
--   c) base donde ya corrio la version anterior de este archivo (con las
--      columnas word/description/category en sign_lexicon). Esas tres columnas
--      se copian (category -> categories.category_id; word/description ->
--      sign_localizations 'ES') y SOLO DESPUES se eliminan.
--
-- Ejecutar manualmente contra la base de datos `lexicon`:
--   psql -h localhost -p 5435 -U postgres -d lexicon -f services/lexicon-service/db/003_lexicon.sql
-- Se puede volver a ejecutar: actualiza las letras sin duplicar nada.

SET client_encoding = 'UTF8';

BEGIN;

-- ── Trigger generico de updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  category_id SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_categories_name UNIQUE (name)
);

-- Sin distinguir mayusculas: si ya existe 'alfabeto' no se crea 'Alfabeto'.
INSERT INTO public.categories (name, description)
SELECT v.name, v.description
FROM (VALUES
  ('Alfabeto', 'Letras del alfabeto dactilologico'),
  ('General',  'Senas sin categoria especifica')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE lower(c.name) = lower(v.name));

-- ── sign_lexicon ────────────────────────────────────────────────────────
-- Si la tabla ya existe (Liquibase 010 o version anterior) solo se completa.
CREATE TABLE IF NOT EXISTS public.sign_lexicon (
  lexicon_id SERIAL PRIMARY KEY,
  type       VARCHAR(50),
  letter     CHAR(1),
  language   VARCHAR(10)
);

ALTER TABLE public.sign_lexicon
  ADD COLUMN IF NOT EXISTS code          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS category_id   INT,
  ADD COLUMN IF NOT EXISTS is_animated   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS display_order INT         NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS status        VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS created_by    INT,
  ADD COLUMN IF NOT EXISTS updated_by    INT,
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- created_by / updated_by son ids logicos de usuarios (iam-service): sin FK entre
-- servicios. Si una version anterior las creo con FK a users, se quita.
ALTER TABLE public.sign_lexicon DROP CONSTRAINT IF EXISTS sign_lexicon_created_by_fkey;
ALTER TABLE public.sign_lexicon DROP CONSTRAINT IF EXISTS sign_lexicon_updated_by_fkey;

-- Filas previas (de Liquibase) incompletas: se les da un valor estable.
-- (Aun no se tocan word/description/category: se migran mas abajo.)
UPDATE public.sign_lexicon SET code = 'SIGN_' || lexicon_id WHERE code IS NULL;
UPDATE public.sign_lexicon SET language = 'LSC' WHERE language IS NULL OR BTRIM(language) = '';
-- Idioma normalizado (evita un segundo alfabeto por 'lsc' vs 'LSC').
UPDATE public.sign_lexicon SET language = UPPER(BTRIM(language)) WHERE language <> UPPER(BTRIM(language));
UPDATE public.sign_lexicon SET type = 'WORD' WHERE type IS NULL;

-- ── sign_localizations ──────────────────────────────────────────────────
-- Textos de la sena por idioma de la interfaz (ES/EN).
CREATE TABLE IF NOT EXISTS public.sign_localizations (
  sign_localization_id SERIAL PRIMARY KEY,
  lexicon_id  INT          NOT NULL REFERENCES public.sign_lexicon(lexicon_id) ON DELETE CASCADE,
  ui_language VARCHAR(2)   NOT NULL,
  name        VARCHAR(150) NOT NULL,
  meaning     VARCHAR(255),
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sign_localizations_lang UNIQUE (lexicon_id, ui_language),
  CONSTRAINT ck_sign_localizations_lang CHECK (ui_language IN ('ES', 'EN'))
);

CREATE INDEX IF NOT EXISTS idx_sign_localizations_name
  ON public.sign_localizations (ui_language, name);

-- ── Migracion de columnas antiguas: word / description / category ───────
-- Se copia su contenido y SOLO DESPUES se eliminan. Si las columnas ya no
-- existen (base nueva o migracion ya aplicada) este bloque no hace nada.
-- SQL dinamico: las columnas pueden no existir al planificar la consulta.
DO $$
DECLARE
  has_word BOOLEAN;
  has_desc BOOLEAN;
  has_cat  BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'sign_lexicon' AND column_name = 'word')
    INTO has_word;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'sign_lexicon' AND column_name = 'description')
    INTO has_desc;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'sign_lexicon' AND column_name = 'category')
    INTO has_cat;

  -- category (texto) -> fila en categories + category_id.
  IF has_cat THEN
    EXECUTE $q$
      INSERT INTO public.categories (name)
      SELECT DISTINCT ON (lower(LEFT(BTRIM(s.category), 100))) LEFT(BTRIM(s.category), 100)
      FROM public.sign_lexicon s
      WHERE s.category IS NOT NULL AND BTRIM(s.category) <> ''
        AND NOT EXISTS (SELECT 1 FROM public.categories c
                        WHERE lower(c.name) = lower(LEFT(BTRIM(s.category), 100)))
      ORDER BY lower(LEFT(BTRIM(s.category), 100)), LEFT(BTRIM(s.category), 100)
    $q$;
    EXECUTE $q$
      UPDATE public.sign_lexicon s
      SET category_id = c.category_id
      FROM public.categories c
      WHERE s.category_id IS NULL
        AND s.category IS NOT NULL
        AND lower(c.name) = lower(LEFT(BTRIM(s.category), 100))
    $q$;
  END IF;

  -- word -> letter (si era una LETTER sin letter y word tiene un solo caracter)
  -- y word/description -> localizacion ES.
  IF has_word THEN
    EXECUTE $q$
      UPDATE public.sign_lexicon
      SET letter = UPPER(BTRIM(word))
      WHERE UPPER(BTRIM(type)) = 'LETTER'
        AND (letter IS NULL OR BTRIM(letter) = '')
        AND CHAR_LENGTH(BTRIM(word)) = 1
    $q$;
    EXECUTE format($q$
      INSERT INTO public.sign_localizations (lexicon_id, ui_language, name, description)
      SELECT lexicon_id, 'ES', LEFT(COALESCE(NULLIF(BTRIM(word), ''), code), 150), %s
      FROM public.sign_lexicon
      ON CONFLICT (lexicon_id, ui_language) DO NOTHING
    $q$, CASE WHEN has_desc THEN 'description' ELSE 'NULL' END);
  END IF;

  -- description sin word (caso raro): completa la localizacion ES existente.
  IF has_desc AND NOT has_word THEN
    EXECUTE $q$
      UPDATE public.sign_localizations l
      SET description = s.description
      FROM public.sign_lexicon s
      WHERE l.lexicon_id = s.lexicon_id
        AND l.ui_language = 'ES'
        AND l.description IS NULL
        AND s.description IS NOT NULL
    $q$;
  END IF;

  -- Ya copiado todo: se eliminan las columnas antiguas (y el indice de word).
  DROP INDEX IF EXISTS public.idx_sign_lexicon_word;
  IF has_word THEN
    EXECUTE 'ALTER TABLE public.sign_lexicon DROP COLUMN word';
  END IF;
  IF has_desc THEN
    EXECUTE 'ALTER TABLE public.sign_lexicon DROP COLUMN description';
  END IF;
  IF has_cat THEN
    EXECUTE 'ALTER TABLE public.sign_lexicon DROP COLUMN category';
  END IF;
END $$;

-- Unicidad de nombres sin distinguir mayusculas ('Saludos' = 'saludos'): la
-- aplica la base, no solo la capa de aplicacion. Se crea DESPUES de migrar la
-- columna antigua `category`, que ya no genera variantes de mayusculas. Si ya
-- hay categorias que solo difieren en mayusculas, hay que fusionarlas antes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name_lower
  ON public.categories (lower(name));

-- Sin categoria -> General.
UPDATE public.sign_lexicon
SET category_id = (SELECT category_id FROM public.categories WHERE lower(name) = 'general')
WHERE category_id IS NULL;

-- ── Saneamiento de datos previos (antes de crear constraints/indices) ───
UPDATE public.sign_lexicon SET type = UPPER(BTRIM(type)) WHERE type <> UPPER(BTRIM(type));
UPDATE public.sign_lexicon SET type = 'WORD' WHERE type NOT IN ('LETTER', 'WORD', 'PHRASE');
UPDATE public.sign_lexicon SET letter = NULL WHERE letter IS NOT NULL AND BTRIM(letter) = '';
UPDATE public.sign_lexicon SET letter = UPPER(letter) WHERE letter IS NOT NULL AND letter <> UPPER(letter);
-- letter existe si y solo si la sena es una letra.
UPDATE public.sign_lexicon SET letter = NULL WHERE type <> 'LETTER' AND letter IS NOT NULL;
UPDATE public.sign_lexicon SET type = 'WORD' WHERE type = 'LETTER' AND letter IS NULL;
-- Letras repetidas en un mismo idioma: se conserva la de menor id y las demas
-- pasan a WORD (no se borra nada).
UPDATE public.sign_lexicon s
SET type = 'WORD', letter = NULL
WHERE s.letter IS NOT NULL
  AND s.lexicon_id <> (SELECT MIN(s2.lexicon_id) FROM public.sign_lexicon s2
                       WHERE s2.language = s.language AND s2.letter = s.letter);
-- Letras LSC con code SINTETICO (SIGN_<id>): se alinean al code de la semilla (LETTER_X,
-- LETTER_NN para la Ñ) para que la semilla no choque con el indice de letras.
-- Un code real nunca se renombra (INV-018).
UPDATE public.sign_lexicon s
SET code = 'LETTER_' || CASE s.letter WHEN 'Ñ' THEN 'NN' ELSE s.letter END
WHERE s.language = 'LSC' AND s.type = 'LETTER'
  AND s.code LIKE 'SIGN\_%'
  AND s.code <> 'LETTER_' || CASE s.letter WHEN 'Ñ' THEN 'NN' ELSE s.letter END
  AND NOT EXISTS (SELECT 1 FROM public.sign_lexicon o
                  WHERE o.code = 'LETTER_' || CASE s.letter WHEN 'Ñ' THEN 'NN' ELSE s.letter END);

ALTER TABLE public.sign_lexicon
  ALTER COLUMN code        SET NOT NULL,
  ALTER COLUMN type        SET NOT NULL,
  ALTER COLUMN type        SET DEFAULT 'WORD',
  ALTER COLUMN language    SET NOT NULL,
  ALTER COLUMN language    SET DEFAULT 'LSC',
  ALTER COLUMN category_id SET NOT NULL;

-- INV-018: el code es la clase que predice el reconocedor; unico.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sign_lexicon_code      ON public.sign_lexicon (code);
-- INV-013: una sola fila por letra e idioma (los NULL no chocan entre si).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sign_lexicon_letter    ON public.sign_lexicon (language, letter);
CREATE INDEX        IF NOT EXISTS idx_sign_lexicon_type     ON public.sign_lexicon (language, type, status);
CREATE INDEX        IF NOT EXISTS idx_sign_lexicon_category ON public.sign_lexicon (category_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sign_lexicon_category') THEN
    ALTER TABLE public.sign_lexicon ADD CONSTRAINT fk_sign_lexicon_category
      FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_sign_lexicon_type') THEN
    ALTER TABLE public.sign_lexicon ADD CONSTRAINT ck_sign_lexicon_type
      CHECK (type IN ('LETTER', 'WORD', 'PHRASE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_sign_lexicon_status') THEN
    ALTER TABLE public.sign_lexicon ADD CONSTRAINT ck_sign_lexicon_status
      CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE'));
  END IF;
  -- letter existe si y solo si la sena es una letra.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_sign_lexicon_letter_iff_type') THEN
    ALTER TABLE public.sign_lexicon ADD CONSTRAINT ck_sign_lexicon_letter_iff_type
      CHECK ((type = 'LETTER') = (letter IS NOT NULL)) NOT VALID;
  END IF;
END $$;
-- Los datos ya se saneo arriba; si la version anterior la dejo NOT VALID, se valida.
ALTER TABLE public.sign_lexicon VALIDATE CONSTRAINT ck_sign_lexicon_letter_iff_type;

-- ── Triggers updated_at ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_sign_lexicon_updated_at'
                   AND tgrelid = 'public.sign_lexicon'::regclass) THEN
    CREATE TRIGGER trg_sign_lexicon_updated_at
      BEFORE UPDATE ON public.sign_lexicon
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_sign_localizations_updated_at'
                   AND tgrelid = 'public.sign_localizations'::regclass) THEN
    CREATE TRIGGER trg_sign_localizations_updated_at
      BEFORE UPDATE ON public.sign_localizations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── multimedia_resource ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.multimedia_resource (
  resource_id   SERIAL PRIMARY KEY,
  type          VARCHAR(50),
  url           VARCHAR(255),
  mime_type     VARCHAR(100),
  display_order INT,
  lexicon_id    INT
);

ALTER TABLE public.multimedia_resource
  ADD COLUMN IF NOT EXISTS lexicon_id  INT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- FK multimedia -> sign_lexicon con ON DELETE CASCADE explicita. El changelog 011
-- de Liquibase la creo sin cascada (fk_multimedia_lexicon) y un ADD COLUMN IF NOT
-- EXISTS con REFERENCES no la reemplaza, asi que se recrea siempre: se borran las
-- variantes conocidas y se crea una unica con nombre propio.
ALTER TABLE public.multimedia_resource DROP CONSTRAINT IF EXISTS fk_multimedia_lexicon;
ALTER TABLE public.multimedia_resource DROP CONSTRAINT IF EXISTS multimedia_resource_lexicon_id_fkey;
ALTER TABLE public.multimedia_resource DROP CONSTRAINT IF EXISTS fk_multimedia_resource_lexicon;
ALTER TABLE public.multimedia_resource
  ADD CONSTRAINT fk_multimedia_resource_lexicon
  FOREIGN KEY (lexicon_id) REFERENCES public.sign_lexicon(lexicon_id) ON DELETE CASCADE;

-- Margen para tipos MIME largos (Liquibase lo creo como VARCHAR(50)).
ALTER TABLE public.multimedia_resource ALTER COLUMN mime_type TYPE VARCHAR(100);

-- display_order: se renumeran (1..n, conservando el orden relativo y
-- resource_id como desempate) las senas con posiciones NULL, < 1 o repetidas.
-- Las senas con posiciones validas y unicas no se tocan.
WITH afectadas AS (
  SELECT lexicon_id
  FROM public.multimedia_resource
  WHERE lexicon_id IS NOT NULL
  GROUP BY lexicon_id
  HAVING COUNT(*) FILTER (WHERE display_order IS NULL OR display_order < 1) > 0
      OR COUNT(display_order) <> COUNT(DISTINCT display_order)
), nuevas AS (
  SELECT r.resource_id,
         ROW_NUMBER() OVER (PARTITION BY r.lexicon_id
                            ORDER BY r.display_order NULLS LAST, r.resource_id) AS pos
  FROM public.multimedia_resource r
  WHERE r.lexicon_id IN (SELECT lexicon_id FROM afectadas)
)
UPDATE public.multimedia_resource r
SET display_order = n.pos
FROM nuevas n
WHERE r.resource_id = n.resource_id;

-- Recursos huerfanos (lexicon_id NULL): solo necesitan un valor valido; al ser
-- NULL el lexicon_id no chocan en el UNIQUE.
UPDATE public.multimedia_resource
SET display_order = 1
WHERE lexicon_id IS NULL AND (display_order IS NULL OR display_order < 1);

ALTER TABLE public.multimedia_resource ALTER COLUMN display_order SET NOT NULL;

-- Posicion unica por sena (reemplaza al indice no unico anterior).
CREATE UNIQUE INDEX IF NOT EXISTS uq_multimedia_resource_position
  ON public.multimedia_resource (lexicon_id, display_order);
DROP INDEX IF EXISTS public.idx_multimedia_resource_lexicon;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_multimedia_resource_type') THEN
    ALTER TABLE public.multimedia_resource ADD CONSTRAINT ck_multimedia_resource_type
      CHECK (type IN ('MODEL_3D', 'IMAGE', 'VIDEO', 'GIF')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_multimedia_resource_order') THEN
    ALTER TABLE public.multimedia_resource ADD CONSTRAINT ck_multimedia_resource_order
      CHECK (display_order >= 1);
  END IF;
END $$;

-- ── Semilla: alfabeto LSC (27 letras) ───────────────────────────────────
-- display_order fija el orden del alfabeto, con la Ñ despues de la N.
-- Cada letra crea su sena (categoria Alfabeto, ACTIVE) y su localizacion ES
-- (name = la letra, description = descripcion de la mano).
-- La semilla SOLO crea lo que falta (DO NOTHING): no pisa lo que un ADMIN haya
-- editado (estado, categoria, orden, textos) al volver a ejecutar el archivo.
WITH seed (code, letter, description, is_animated, display_order) AS (
  VALUES
    ('LETTER_A', 'A', 'Puño cerrado con el pulgar extendido, pegado al costado del índice.', FALSE, 1),
    ('LETTER_B', 'B', 'Cuatro dedos extendidos y juntos; el pulgar va guardado, pegado a la palma.', FALSE, 2),
    ('LETTER_C', 'C', 'Todos los dedos curvados formando una C abierta, con la mano mirando hacia adentro.', FALSE, 3),
    ('LETTER_D', 'D', 'Índice recto hacia arriba; medio, anular y meñique recogidos con el pulgar apoyado contra ellos, formando un óvalo en la base del índice.', FALSE, 4),
    ('LETTER_E', 'E', 'Dedos flexionados en garra sobre la palma; el pulgar va guardado debajo de los dedos.', FALSE, 5),
    ('LETTER_F', 'F', 'Índice y pulgar extendidos hacia arriba y juntos; el resto de la mano en puño.', FALSE, 6),
    ('LETTER_G', 'G', 'Mano horizontal con índice y pulgar extendidos; el índice se flexiona y vuelve a extenderse sin mover la mano.', TRUE, 7),
    ('LETTER_H', 'H', 'Mano horizontal con índice y medio extendidos y paralelos; anular y meñique recogidos con el pulgar. Se desplaza un poco en horizontal.', TRUE, 8),
    ('LETTER_I', 'I', 'Meñique extendido hacia arriba; el resto de la mano cerrada.', FALSE, 9),
    ('LETTER_J', 'J', 'Con la configuración de la I, el meñique traza la curva de la J en el aire.', TRUE, 10),
    ('LETTER_K', 'K', 'Mano horizontal mirando hacia adentro: índice extendido, medio en diagonal hacia abajo y el pulgar apoyado entre ambos; anular y meñique recogidos.', FALSE, 11),
    ('LETTER_L', 'L', 'Pulgar e índice extendidos en ángulo recto formando una L.', FALSE, 12),
    ('LETTER_M', 'M', 'Índice, medio y anular flexionados cubren el pulgar.', FALSE, 13),
    ('LETTER_N', 'N', 'Índice y medio flexionados cubren el pulgar.', FALSE, 14),
    ('LETTER_NN', 'Ñ', 'Con la configuración de la N, la mano hace un movimiento ondulado corto.', TRUE, 15),
    ('LETTER_O', 'O', 'Dedos y pulgar curvados formando un círculo cerrado.', FALSE, 16),
    ('LETTER_P', 'P', 'Mano colgando con el índice recto hacia abajo; el medio se une con la punta del pulgar formando un aro a un lado. Anular y meñique recogidos.', FALSE, 17),
    ('LETTER_Q', 'Q', 'Los cuatro dedos juntos y semiflexionados, con la punta del pulgar tocando las yemas de índice y medio. Se muestra el dorso de la mano.', FALSE, 18),
    ('LETTER_R', 'R', 'Índice y medio extendidos hacia arriba y separados.', FALSE, 19),
    ('LETTER_S', 'S', 'Índice extendido hacia arriba trazando una S en el aire.', TRUE, 20),
    ('LETTER_T', 'T', 'Medio, anular y meñique juntos y rectos hacia arriba; índice y pulgar se unen por las yemas formando un aro.', FALSE, 21),
    ('LETTER_U', 'U', 'Índice y meñique extendidos hacia arriba; medio y anular doblados en la palma, sujetos por el pulgar. Palma al frente.', FALSE, 22),
    ('LETTER_V', 'V', 'Como el número 2: índice y medio extendidos y separados en V; el pulgar sujeta anular y meñique.', FALSE, 23),
    ('LETTER_W', 'W', 'Como el número 3: índice, medio y anular extendidos y separados; el pulgar sujeta el meñique.', FALSE, 24),
    ('LETTER_X', 'X', 'Índice flexionado en forma de gancho; el resto de la mano cerrada.', FALSE, 25),
    ('LETTER_Y', 'Y', 'Pulgar y meñique extendidos; índice, medio y anular doblados en la palma. Palma al frente.', FALSE, 26),
    ('LETTER_Z', 'Z', 'Índice extendido trazando la letra Z en el aire.', TRUE, 27)
), ins AS (
  INSERT INTO public.sign_lexicon
    (code, type, letter, language, category_id, is_animated, display_order, status)
  SELECT s.code, 'LETTER', s.letter, 'LSC',
         (SELECT category_id FROM public.categories WHERE lower(name) = 'alfabeto'),
         s.is_animated, s.display_order, 'ACTIVE'
  FROM seed s
  ON CONFLICT DO NOTHING
  RETURNING lexicon_id, code
)
INSERT INTO public.sign_localizations (lexicon_id, ui_language, name, description)
SELECT t.lexicon_id, 'ES', s.letter, s.description
FROM (
  SELECT lexicon_id, code FROM ins
  UNION ALL
  SELECT lexicon_id, code FROM public.sign_lexicon WHERE code IN (SELECT code FROM seed)
) t
JOIN seed s ON s.code = t.code
ON CONFLICT (lexicon_id, ui_language) DO NOTHING;

-- Recursos: miniatura (card) y modelo 3D (modal). Rutas relativas a
-- /api/lexicon/media; la API las devuelve como URL absolutas.
-- Solo se crea el recurso si esa url no existe para la sena. Va en su posicion
-- si esta libre; si no, en MAX(display_order)+1. Nunca aborta la migracion.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT s.lexicon_id, v.type, v.url, v.mime_type, v.display_order, v.description
    FROM (VALUES
    ('LETTER_A', 'IMAGE', 'alfabeto/thumbs/A.png', 'image/png', 1, 'Seña de la letra A (imagen)'),
    ('LETTER_A', 'MODEL_3D', 'alfabeto/glb/A.glb', 'model/gltf-binary', 2, 'Seña de la letra A (modelo 3D)'),
    ('LETTER_B', 'IMAGE', 'alfabeto/thumbs/B.png', 'image/png', 1, 'Seña de la letra B (imagen)'),
    ('LETTER_B', 'MODEL_3D', 'alfabeto/glb/B.glb', 'model/gltf-binary', 2, 'Seña de la letra B (modelo 3D)'),
    ('LETTER_C', 'IMAGE', 'alfabeto/thumbs/C.png', 'image/png', 1, 'Seña de la letra C (imagen)'),
    ('LETTER_C', 'MODEL_3D', 'alfabeto/glb/C.glb', 'model/gltf-binary', 2, 'Seña de la letra C (modelo 3D)'),
    ('LETTER_D', 'IMAGE', 'alfabeto/thumbs/D.png', 'image/png', 1, 'Seña de la letra D (imagen)'),
    ('LETTER_D', 'MODEL_3D', 'alfabeto/glb/D.glb', 'model/gltf-binary', 2, 'Seña de la letra D (modelo 3D)'),
    ('LETTER_E', 'IMAGE', 'alfabeto/thumbs/E.png', 'image/png', 1, 'Seña de la letra E (imagen)'),
    ('LETTER_E', 'MODEL_3D', 'alfabeto/glb/E.glb', 'model/gltf-binary', 2, 'Seña de la letra E (modelo 3D)'),
    ('LETTER_F', 'IMAGE', 'alfabeto/thumbs/F.png', 'image/png', 1, 'Seña de la letra F (imagen)'),
    ('LETTER_F', 'MODEL_3D', 'alfabeto/glb/F.glb', 'model/gltf-binary', 2, 'Seña de la letra F (modelo 3D)'),
    ('LETTER_G', 'IMAGE', 'alfabeto/thumbs/G.png', 'image/png', 1, 'Seña de la letra G (imagen)'),
    ('LETTER_G', 'MODEL_3D', 'alfabeto/glb/G.glb', 'model/gltf-binary', 2, 'Seña de la letra G (modelo 3D, con movimiento)'),
    ('LETTER_H', 'IMAGE', 'alfabeto/thumbs/H.png', 'image/png', 1, 'Seña de la letra H (imagen)'),
    ('LETTER_H', 'MODEL_3D', 'alfabeto/glb/H.glb', 'model/gltf-binary', 2, 'Seña de la letra H (modelo 3D, con movimiento)'),
    ('LETTER_I', 'IMAGE', 'alfabeto/thumbs/I.png', 'image/png', 1, 'Seña de la letra I (imagen)'),
    ('LETTER_I', 'MODEL_3D', 'alfabeto/glb/I.glb', 'model/gltf-binary', 2, 'Seña de la letra I (modelo 3D)'),
    ('LETTER_J', 'IMAGE', 'alfabeto/thumbs/J.png', 'image/png', 1, 'Seña de la letra J (imagen)'),
    ('LETTER_J', 'MODEL_3D', 'alfabeto/glb/J.glb', 'model/gltf-binary', 2, 'Seña de la letra J (modelo 3D, con movimiento)'),
    ('LETTER_K', 'IMAGE', 'alfabeto/thumbs/K.png', 'image/png', 1, 'Seña de la letra K (imagen)'),
    ('LETTER_K', 'MODEL_3D', 'alfabeto/glb/K.glb', 'model/gltf-binary', 2, 'Seña de la letra K (modelo 3D)'),
    ('LETTER_L', 'IMAGE', 'alfabeto/thumbs/L.png', 'image/png', 1, 'Seña de la letra L (imagen)'),
    ('LETTER_L', 'MODEL_3D', 'alfabeto/glb/L.glb', 'model/gltf-binary', 2, 'Seña de la letra L (modelo 3D)'),
    ('LETTER_M', 'IMAGE', 'alfabeto/thumbs/M.png', 'image/png', 1, 'Seña de la letra M (imagen)'),
    ('LETTER_M', 'MODEL_3D', 'alfabeto/glb/M.glb', 'model/gltf-binary', 2, 'Seña de la letra M (modelo 3D)'),
    ('LETTER_N', 'IMAGE', 'alfabeto/thumbs/N.png', 'image/png', 1, 'Seña de la letra N (imagen)'),
    ('LETTER_N', 'MODEL_3D', 'alfabeto/glb/N.glb', 'model/gltf-binary', 2, 'Seña de la letra N (modelo 3D)'),
    ('LETTER_NN', 'IMAGE', 'alfabeto/thumbs/NN.png', 'image/png', 1, 'Seña de la letra Ñ (imagen)'),
    ('LETTER_NN', 'MODEL_3D', 'alfabeto/glb/NN.glb', 'model/gltf-binary', 2, 'Seña de la letra Ñ (modelo 3D, con movimiento)'),
    ('LETTER_O', 'IMAGE', 'alfabeto/thumbs/O.png', 'image/png', 1, 'Seña de la letra O (imagen)'),
    ('LETTER_O', 'MODEL_3D', 'alfabeto/glb/O.glb', 'model/gltf-binary', 2, 'Seña de la letra O (modelo 3D)'),
    ('LETTER_P', 'IMAGE', 'alfabeto/thumbs/P.png', 'image/png', 1, 'Seña de la letra P (imagen)'),
    ('LETTER_P', 'MODEL_3D', 'alfabeto/glb/P.glb', 'model/gltf-binary', 2, 'Seña de la letra P (modelo 3D)'),
    ('LETTER_Q', 'IMAGE', 'alfabeto/thumbs/Q.png', 'image/png', 1, 'Seña de la letra Q (imagen)'),
    ('LETTER_Q', 'MODEL_3D', 'alfabeto/glb/Q.glb', 'model/gltf-binary', 2, 'Seña de la letra Q (modelo 3D)'),
    ('LETTER_R', 'IMAGE', 'alfabeto/thumbs/R.png', 'image/png', 1, 'Seña de la letra R (imagen)'),
    ('LETTER_R', 'MODEL_3D', 'alfabeto/glb/R.glb', 'model/gltf-binary', 2, 'Seña de la letra R (modelo 3D)'),
    ('LETTER_S', 'IMAGE', 'alfabeto/thumbs/S.png', 'image/png', 1, 'Seña de la letra S (imagen)'),
    ('LETTER_S', 'MODEL_3D', 'alfabeto/glb/S.glb', 'model/gltf-binary', 2, 'Seña de la letra S (modelo 3D, con movimiento)'),
    ('LETTER_T', 'IMAGE', 'alfabeto/thumbs/T.png', 'image/png', 1, 'Seña de la letra T (imagen)'),
    ('LETTER_T', 'MODEL_3D', 'alfabeto/glb/T.glb', 'model/gltf-binary', 2, 'Seña de la letra T (modelo 3D)'),
    ('LETTER_U', 'IMAGE', 'alfabeto/thumbs/U.png', 'image/png', 1, 'Seña de la letra U (imagen)'),
    ('LETTER_U', 'MODEL_3D', 'alfabeto/glb/U.glb', 'model/gltf-binary', 2, 'Seña de la letra U (modelo 3D)'),
    ('LETTER_V', 'IMAGE', 'alfabeto/thumbs/V.png', 'image/png', 1, 'Seña de la letra V (imagen)'),
    ('LETTER_V', 'MODEL_3D', 'alfabeto/glb/V.glb', 'model/gltf-binary', 2, 'Seña de la letra V (modelo 3D)'),
    ('LETTER_W', 'IMAGE', 'alfabeto/thumbs/W.png', 'image/png', 1, 'Seña de la letra W (imagen)'),
    ('LETTER_W', 'MODEL_3D', 'alfabeto/glb/W.glb', 'model/gltf-binary', 2, 'Seña de la letra W (modelo 3D)'),
    ('LETTER_X', 'IMAGE', 'alfabeto/thumbs/X.png', 'image/png', 1, 'Seña de la letra X (imagen)'),
    ('LETTER_X', 'MODEL_3D', 'alfabeto/glb/X.glb', 'model/gltf-binary', 2, 'Seña de la letra X (modelo 3D)'),
    ('LETTER_Y', 'IMAGE', 'alfabeto/thumbs/Y.png', 'image/png', 1, 'Seña de la letra Y (imagen)'),
    ('LETTER_Y', 'MODEL_3D', 'alfabeto/glb/Y.glb', 'model/gltf-binary', 2, 'Seña de la letra Y (modelo 3D)'),
    ('LETTER_Z', 'IMAGE', 'alfabeto/thumbs/Z.png', 'image/png', 1, 'Seña de la letra Z (imagen)'),
    ('LETTER_Z', 'MODEL_3D', 'alfabeto/glb/Z.glb', 'model/gltf-binary', 2, 'Seña de la letra Z (modelo 3D, con movimiento)')
    ) AS v(code, type, url, mime_type, display_order, description)
    JOIN public.sign_lexicon s ON s.code = v.code
    ORDER BY s.lexicon_id, v.display_order
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.multimedia_resource m
                   WHERE m.lexicon_id = r.lexicon_id AND m.url = r.url) THEN
      INSERT INTO public.multimedia_resource
        (lexicon_id, type, url, mime_type, display_order, description)
      VALUES (
        r.lexicon_id, r.type, r.url, r.mime_type,
        CASE WHEN EXISTS (SELECT 1 FROM public.multimedia_resource m
                          WHERE m.lexicon_id = r.lexicon_id AND m.display_order = r.display_order)
             THEN (SELECT MAX(m.display_order) + 1 FROM public.multimedia_resource m
                   WHERE m.lexicon_id = r.lexicon_id)
             ELSE r.display_order END,
        r.description);
    END IF;
  END LOOP;
END $$;

COMMIT;

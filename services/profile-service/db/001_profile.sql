-- Migracion 001: profile-service
-- Perfil/preferencias (03-profile), notificaciones (07-notification) y logros
-- (09-gamification). Los user_id son logicos (los crea iam-service): sin FK a users.
-- Se puede volver a ejecutar:
--   psql -h localhost -p 5437 -U postgres -d profile -f services/profile-service/db/001_profile.sql

SET client_encoding = 'UTF8';

BEGIN;

-- Datos de cuenta replicados desde iam.UserRegistered.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id    UUID         PRIMARY KEY,
  email      VARCHAR(255),
  full_name  VARCHAR(255),
  username   VARCHAR(255),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_preference_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL UNIQUE,
  ui_language           VARCHAR(2)  NOT NULL DEFAULT 'ES' CHECK (ui_language IN ('ES', 'EN')),
  theme                 VARCHAR(5)  NOT NULL DEFAULT 'LIGHT' CHECK (theme IN ('LIGHT', 'DARK')),
  notifications_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_types (
  notification_type_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 VARCHAR(50)  NOT NULL UNIQUE,
  name                 VARCHAR(100) NOT NULL,
  description          VARCHAR(255),
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID         NOT NULL,
  notification_type_id UUID         NOT NULL REFERENCES notification_types (notification_type_id) ON DELETE RESTRICT,
  channel              VARCHAR(10)  NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('PUSH', 'EMAIL', 'IN_APP')),
  title                VARCHAR(150) NOT NULL,
  body                 TEXT         NOT NULL,
  reference_type       VARCHAR(20),
  reference_id         UUID,
  status               VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                                    CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'READ', 'CANCELLED')),
  scheduled_at         TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ,
  read_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at);

CREATE TABLE IF NOT EXISTS achievements (
  achievement_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(50)  NOT NULL UNIQUE,
  name           VARCHAR(100) NOT NULL,
  description    TEXT         NOT NULL,
  metric         VARCHAR(30)  NOT NULL
                              CHECK (metric IN ('TRANSLATIONS_COMPLETED', 'SIGNS_LEARNED', 'ALPHABET_COMPLETED', 'SESSIONS_COMPLETED')),
  target_count   INTEGER      NOT NULL CONSTRAINT ck_achievement_target CHECK (target_count > 0),
  points         INTEGER      NOT NULL DEFAULT 10,
  icon_reference TEXT,
  is_secret      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_achievement_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL,
  achievement_id      UUID        NOT NULL REFERENCES achievements (achievement_id) ON DELETE RESTRICT,
  current_count       INTEGER     NOT NULL DEFAULT 0,
  achieved_at         TIMESTAMPTZ,
  notified_at         TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_achievement ON user_achievements (user_id, achievement_id);

-- Eventos ya procesados: idempotencia de los consumidores (por eventId).
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     UUID        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notification_types (code, name, description) VALUES
  ('ACHIEVEMENT_UNLOCKED', 'Logro desbloqueado', 'Aviso al desbloquear un logro')
ON CONFLICT (code) DO NOTHING;

INSERT INTO achievements (code, name, description, metric, target_count, points) VALUES
  ('FIRST_TRANSLATION', 'Primera traducción', 'Realiza tu primera traducción de señas', 'TRANSLATIONS_COMPLETED', 1, 10),
  ('TEN_TRANSLATIONS', '10 traducciones', 'Realiza 10 traducciones de señas', 'TRANSLATIONS_COMPLETED', 10, 20),
  ('FIFTY_TRANSLATIONS', '50 traducciones', 'Realiza 50 traducciones de señas', 'TRANSLATIONS_COMPLETED', 50, 50)
ON CONFLICT (code) DO NOTHING;

COMMIT;

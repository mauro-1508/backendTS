-- usage_event de analytics-service (equivale al changelog 006). Sin FK: user_id y
-- session_id son ids logicos de iam-service. event_id UNIQUE = idempotencia de consumidores.
CREATE TABLE IF NOT EXISTS usage_event (
  usage_event_id BIGSERIAL    PRIMARY KEY,
  event_id       VARCHAR(64)  NOT NULL CONSTRAINT uq_usage_event_event_id UNIQUE,
  user_id        VARCHAR(64),
  session_id     VARCHAR(64),
  section        VARCHAR(32)  NOT NULL,
  event_type     VARCHAR(32)  NOT NULL,
  reference_type VARCHAR(32),
  reference_id   VARCHAR(64),
  sign_codes     TEXT[]       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_usage_event_type_created    ON usage_event (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_event_section_created ON usage_event (section, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_event_user_created    ON usage_event (user_id, created_at);

-- Migration 007: resumenes y recordatorios IN_APP para administradores (idempotente).
-- admin_recipients: ADMIN conocidos (los marca el middleware al ver su JWT); admin_report_runs: un
-- registro por reporte y periodo, para que ninguna vuelta del planificador lo envie dos veces.
-- Sin FK a usuarios: user_id es logico.
--   psql -X -v ON_ERROR_STOP=1 -h localhost -p 5437 -U postgres -d profile -f services/profile-service/db/007_admin_reports.sql

SET client_encoding = 'UTF8';

BEGIN;

INSERT INTO notification_types (code, name, description) VALUES
  ('ADMIN_WEEKLY_REPORT', 'Resumen semanal', 'Resumen semanal de uso para administradores'),
  ('ADMIN_MONTHLY_REPORT', 'Resumen mensual', 'Resumen mensual de uso para administradores'),
  ('ADMIN_MODEL_REMINDER', 'Recordatorio del modelo', 'Recordatorio semanal para ampliar el vocabulario del modelo')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_recipients (
  user_id      VARCHAR(64) PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_report_runs (
  run_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       VARCHAR(20) NOT NULL CHECK (kind IN ('WEEKLY', 'MONTHLY', 'MODEL_REMINDER')),
  period_key VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, period_key)
);

-- Una notificacion por administrador y reporte (reference_type no tiene CHECK).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_admin_report
  ON notifications (user_id, reference_id) WHERE reference_type = 'ADMIN_REPORT';

COMMIT;

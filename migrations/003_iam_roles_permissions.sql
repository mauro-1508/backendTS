-- Migration 003: iam (RBAC: roles y permisos)
-- Crea roles, permissions, user_roles y role_permissions y siembra los roles base.
-- Ver Docs/06-data/domains/02-authorization.md (INV-016, INV-017). Se usa el esquema
-- public e ids SERIAL, igual que users (INT). Es idempotente: se puede ejecutar dos veces.
-- Ejecutar manualmente contra la base de datos `traduce_senas`:
--   psql -h localhost -p 5433 -U postgres -d traduce_senas -f migrations/003_iam_roles_permissions.sql

CREATE TABLE IF NOT EXISTS public.roles (
  role_id     SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  permission_id SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,
  description   VARCHAR(255)
);

-- RESTRICT: un rol en uso no se puede borrar (INV-017).
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id     INT NOT NULL,
  role_id     INT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES public.roles(role_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       INT NOT NULL,
  permission_id INT NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES public.roles(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES public.permissions(permission_id) ON DELETE CASCADE
);

-- Seed (S001): roles
INSERT INTO public.roles (name, description) VALUES
  ('USER', 'Cuenta estandar, asignada al registrarse'),
  ('LINGUIST', 'Captura y valida muestras de senas; no administra usuarios'),
  ('ADMIN', 'Administracion del sistema')
ON CONFLICT (name) DO NOTHING;

-- Seed (S001): permisos
INSERT INTO public.permissions (name) VALUES
  ('translation.create'), ('translation.read.own'), ('translation.delete.own'),
  ('lexicon.read'), ('profile.manage.own'),
  ('samples.capture'), ('samples.validate'), ('lexicon.write'),
  ('users.manage'), ('stats.read'), ('models.manage'),
  ('notifications.manage'), ('security.policy.manage')
ON CONFLICT (name) DO NOTHING;

-- Seed (S001): permisos por rol (USER; LINGUIST = USER + extras; ADMIN = todos)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM public.roles r
JOIN public.permissions p ON (
  (r.name = 'USER' AND p.name IN
    ('translation.create', 'translation.read.own', 'translation.delete.own', 'lexicon.read', 'profile.manage.own'))
  OR (r.name = 'LINGUIST' AND p.name IN
    ('translation.create', 'translation.read.own', 'translation.delete.own', 'lexicon.read', 'profile.manage.own',
     'samples.capture', 'samples.validate', 'lexicon.write'))
  OR (r.name = 'ADMIN')
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Backfill: toda cuenta existente recibe el rol USER.
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM public.users u
CROSS JOIN public.roles r
WHERE r.name = 'USER'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- No hay endpoint para crear el primer ADMIN. Promoverlo a mano (reemplazar el placeholder):
-- INSERT INTO public.user_roles (user_id, role_id)
-- SELECT u.user_id, r.role_id
-- FROM public.users u, public.roles r
-- WHERE u.email = '<EMAIL_DEL_ADMIN>' AND r.name = 'ADMIN'
-- ON CONFLICT (user_id, role_id) DO NOTHING;

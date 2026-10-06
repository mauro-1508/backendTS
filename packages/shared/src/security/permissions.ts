/** Nombres de permiso del RBAC. iam los concede por rol y los firma en el JWT. */
export const PERMISSIONS = {
  TRANSLATION_CREATE: 'translation.create',
  TRANSLATION_READ_OWN: 'translation.read.own',
  TRANSLATION_DELETE_OWN: 'translation.delete.own',
  LEXICON_READ: 'lexicon.read',
  LEXICON_WRITE: 'lexicon.write',
  PROFILE_MANAGE_OWN: 'profile.manage.own',
  SAMPLES_CAPTURE: 'samples.capture',
  SAMPLES_VALIDATE: 'samples.validate',
  USERS_MANAGE: 'users.manage',
  STATS_READ: 'stats.read',
  MODELS_MANAGE: 'models.manage',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  SECURITY_POLICY_MANAGE: 'security.policy.manage',
} as const;
export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

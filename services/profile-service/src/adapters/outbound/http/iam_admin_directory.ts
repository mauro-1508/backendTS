import { PERMISSIONS, TokenProvider } from '@traduce/shared';
import { AdminDirectory } from '../../../ports/admin_directory';

const REQUEST_TIMEOUT_MS = 5000;
const SERVICE_USER_ID = 0;
const SERVICE_EMAIL = 'profile-service@internal';
const ADMINS_PATH = '/api/users/admins';

const isUserId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

/** Pide a iam los ids de los admins activos con un bearer de servicio de vida corta. */
export const makeIamAdminDirectory = (deps: {
  iamUrl: string;
  /** Debe firmar con expiracion corta (p. ej. 5m). */
  serviceTokens: TokenProvider;
  fetchFn?: typeof fetch;
}): AdminDirectory => {
  const fetchFn = deps.fetchFn ?? fetch;
  return {
    async listAdminIds() {
      const token = deps.serviceTokens.sign({
        userId: SERVICE_USER_ID, email: SERVICE_EMAIL, roles: [], permissions: [PERMISSIONS.ADMIN_DIRECTORY_READ],
      });
      const response = await fetchFn(`${deps.iamUrl}${ADMINS_PATH}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`${ADMINS_PATH} respondio ${response.status}`);
      }
      const body = (await response.json()) as { data?: { userIds?: unknown } } | null;
      const userIds = body?.data?.userIds;
      if (!Array.isArray(userIds) || !userIds.every(isUserId)) {
        throw new Error('iam: la lista de admins no tiene la forma esperada');
      }
      return userIds.map(String);
    },
  };
};

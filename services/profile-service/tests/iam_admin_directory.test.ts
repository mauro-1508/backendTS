import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PERMISSIONS } from '@traduce/shared';
import { makeIamAdminDirectory } from '../src/adapters/outbound/http/iam_admin_directory';

const makeDirectory = (response: () => Response) => {
  const requests: { url: string; auth?: string }[] = [];
  const signed: unknown[] = [];
  const directory = makeIamAdminDirectory({
    iamUrl: 'http://iam:3001',
    serviceTokens: { sign: payload => { signed.push(payload); return 'tok'; }, verify: () => { throw new Error('no'); } },
    fetchFn: (async (url: string, init?: RequestInit) => {
      requests.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization });
      return response();
    }) as typeof fetch,
  });
  return { directory, requests, signed };
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('iam_admin_directory', () => {
  it('pide /api/users/admins con un token de servicio con admins.read y devuelve ids como texto', async () => {
    const { directory, requests, signed } = makeDirectory(() => json({ success: true, data: { userIds: [1, 2] } }));
    assert.deepEqual(await directory.listAdminIds(), ['1', '2']);
    assert.deepEqual(requests, [{ url: 'http://iam:3001/api/users/admins', auth: 'Bearer tok' }]);
    assert.deepEqual((signed[0] as { permissions: string[] }).permissions, [PERMISSIONS.ADMIN_DIRECTORY_READ]);
  });

  it('falla si iam responde con error', async () => {
    const { directory } = makeDirectory(() => json({ success: false }, 403));
    await assert.rejects(directory.listAdminIds(), /respondio 403/);
  });

  it('falla si la forma de la respuesta no es la esperada', async () => {
    const { directory } = makeDirectory(() => json({ success: true, data: { userIds: ['x'] } }));
    await assert.rejects(directory.listAdminIds(), /forma esperada/);
  });
});

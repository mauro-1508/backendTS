import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeAccountDeletionCodes } from '../../../src/auth/application/account_deletion_codes';
import { AuthRepository } from '../../../src/auth/domain/repository';
import { UserToken } from '../../../src/auth/domain/entity';
import { argsOf } from '../../helpers/fakes';

const hasher = { hash: async (plain: string) => `h:${plain}`, compare: async (plain: string, hash: string) => hash === `h:${plain}` };
const user = { userId: 7, email: 'ana@x.com', name: 'Ana' };

const setup = (opts: { decision?: 'issued' | 'cooldown' | 'hourly_limit'; token?: UserToken | null } = {}) => {
  let issuedHash = '';
  const issueTokenIfAllowed = mock.fn(async (p: Parameters<AuthRepository['issueTokenIfAllowed']>[0]) => {
    const decision = opts.decision ?? 'issued';
    if (decision === 'issued') issuedHash = await p.hashToken();
    return decision;
  });
  const reserveAttempt = mock.fn(async () => opts.token ?? null);
  const authRepository = { issueTokenIfAllowed, reserveAttempt } as unknown as AuthRepository;
  const sendAccountDeletionCode = mock.fn(async (_p: { to: string; name: string; code: string }) => undefined as void);
  const mailer = { sendAccountDeletionCode, sendPasswordResetCode: async () => undefined, sendVerificationCode: async () => undefined };
  const codes = makeAccountDeletionCodes({ authRepository, passwordHasher: hasher, mailer });
  return { codes, issueTokenIfAllowed, reserveAttempt, sendAccountDeletionCode, issuedHash: () => issuedHash };
};

const tokenFor = (code: string): UserToken =>
  ({ tokenId: 1, userId: 7, tokenType: 'ACCOUNT_DELETION', tokenHash: `h:${code}` }) as unknown as UserToken;

describe('codigos de borrado de cuenta', () => {
  test('send: emite un token ACCOUNT_DELETION y envia el mismo codigo al correo', async () => {
    const ctx = setup();
    assert.equal(await ctx.codes.send(user), 'issued');
    assert.equal(argsOf(ctx.issueTokenIfAllowed)[0].type, 'ACCOUNT_DELETION');
    const { to, name, code } = argsOf(ctx.sendAccountDeletionCode)[0];
    assert.deepEqual({ to, name }, { to: 'ana@x.com', name: 'Ana' });
    assert.match(code, /^\d{6}$/);
    assert.equal(ctx.issuedHash(), `h:${code}`);
  });

  test('send: en enfriamiento o con el tope horario no envia correo', async () => {
    for (const decision of ['cooldown', 'hourly_limit'] as const) {
      const ctx = setup({ decision });
      assert.equal(await ctx.codes.send(user), decision);
      assert.equal(ctx.sendAccountDeletionCode.mock.callCount(), 0);
    }
  });

  test('check: true solo si coincide con el token vivo, reservando un intento de ACCOUNT_DELETION', async () => {
    const ctx = setup({ token: tokenFor('123456') });
    assert.equal(await ctx.codes.check(7, '123456'), true);
    assert.equal(await ctx.codes.check(7, '000000'), false);
    const [userId, type, , maxAttempts] = argsOf(ctx.reserveAttempt, 0);
    assert.deepEqual([userId, type, maxAttempts], [7, 'ACCOUNT_DELETION', 5]);
  });

  test('check: sin token vivo (caducado, usado o agotado) devuelve false', async () => {
    const ctx = setup({ token: null });
    assert.equal(await ctx.codes.check(7, '123456'), false);
  });
});

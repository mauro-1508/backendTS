import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeChangePassword } from '../../../src/users/application/change_password';
import { makeDeleteAccount } from '../../../src/users/application/delete_account';
import {
  accountDomainService,
  AccountValidationError,
  InvalidPasswordError,
  LastAdminAccountError,
} from '../../../src/users/domain/service';
import { User } from '../../../src/users/domain/entity';
import { AccountRepository } from '../../../src/users/domain/repository';
import { makeLogin } from '../../../src/auth/application/login';
import { InvalidCredentialsError } from '../../../src/auth/domain/service';
import { bcryptPasswordHasher } from '../../../src/users/adapters/outbound/security/password';
import { resolvesMatching } from '../../helpers/fakes';

const OLD = 'Clave.Vieja1';
const NEW = 'Clave.Nueva2';

const build = async (overrides: Partial<User> = {}) => {
  const user: User = {
    userId: 7,
    name: 'Ana',
    email: 'ana@x.com',
    password: await bcryptPasswordHasher.hash(OLD),
    status: 'ACTIVE',
    emailVerifiedAt: null,
    termsAccepted: true,
    termsAcceptedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
  const userRepository = {
    findById: mock.fn(async (id: number) => (id === user.userId ? user : null)),
    findByEmail: mock.fn(async (email: string) => (email === user.email ? user : null)),
    create: mock.fn(async () => user),
    deleteById: mock.fn(async () => undefined),
    updatePassword: mock.fn(async () => undefined),
  };
  const changePassword = mock.fn(async (_id: number, hash: string) => void (user.password = hash));
  const erase = mock.fn(async (_id: number): Promise<'erased' | 'last_admin' | 'not_found'> => 'erased');
  const accountRepository: AccountRepository = { changePassword, erase };
  return { user, userRepository, accountRepository, changePassword, erase, passwordHasher: bcryptPasswordHasher };
};

describe('reglas de la contraseña nueva', () => {
  const bad = (p: string) => assert.throws(() => accountDomainService.ensureNewPasswordIsValid(p), AccountValidationError);

  test('acepta una contraseña que cumple todo', () => {
    assert.doesNotThrow(() => accountDomainService.ensureNewPasswordIsValid(NEW));
  });
  test('rechaza corta, sin mayuscula, sin minuscula, sin numero y sin simbolo', () => {
    bad('Ab.1xyz');
    bad('clave.nueva2');
    bad('CLAVE.NUEVA2');
    bad('Clave.Nueva');
    bad('ClaveNueva22');
  });
  test('rechaza mas de 72 bytes (no cuenta caracteres)', () => {
    bad('Aa.1' + 'x'.repeat(69)); // 73 bytes
    assert.doesNotThrow(() => accountDomainService.ensureNewPasswordIsValid('Aa.1' + 'x'.repeat(68))); // 72
    bad('Aa.1' + 'ñ'.repeat(35)); // 39 caracteres, 74 bytes
  });
});

describe('change_password', () => {
  test('con la actual correcta guarda un hash bcrypt nuevo y el login viejo deja de funcionar', async () => {
    const d = await build();
    const result = await makeChangePassword(d)({ userId: 7, currentPassword: OLD, newPassword: NEW });
    assert.equal(result.success, true);
    assert.equal(d.changePassword.mock.callCount(), 1);
    assert.match(d.user.password!, /^\$2[aby]\$/);

    const login = makeLogin({
      userRepository: d.userRepository,
      passwordHasher: d.passwordHasher,
      tokenProvider: { sign: () => 'jwt', verify: () => ({}) as never },
      roleReader: { readAccess: async () => ({ roles: ['USER'], permissions: [] }) },
    });
    await assert.rejects(login({ email: 'ana@x.com', password: OLD }), InvalidCredentialsError);
    await resolvesMatching(login({ email: 'ana@x.com', password: NEW }), { success: true });
  });

  test('403 INVALID_PASSWORD si la actual no coincide, sin guardar nada', async () => {
    const d = await build();
    await assert.rejects(makeChangePassword(d)({ userId: 7, currentPassword: 'otra', newPassword: NEW }), InvalidPasswordError);
    assert.equal(d.changePassword.mock.callCount(), 0);
  });

  test('400 si la nueva es igual a la actual', async () => {
    const d = await build();
    await assert.rejects(makeChangePassword(d)({ userId: 7, currentPassword: OLD, newPassword: OLD }), AccountValidationError);
    assert.equal(d.changePassword.mock.callCount(), 0);
  });

  test('400 si la nueva incumple las reglas, antes de tocar la base', async () => {
    const d = await build();
    await assert.rejects(makeChangePassword(d)({ userId: 7, currentPassword: OLD, newPassword: 'corta' }), AccountValidationError);
    assert.equal(d.userRepository.findById.mock.callCount(), 0);
  });

  test('cuenta sin contraseña (login social): 403 INVALID_PASSWORD', async () => {
    const d = await build({ password: null });
    await assert.rejects(makeChangePassword(d)({ userId: 7, currentPassword: OLD, newPassword: NEW }), InvalidPasswordError);
  });
});

describe('delete_account', () => {
  test('con la contraseña correcta borra la cuenta', async () => {
    const d = await build();
    const r = await makeDeleteAccount({ ...d, adminGuard: { isLastAdmin: async () => false } })({ userId: 7, password: OLD });
    assert.equal(r.success, true);
    assert.deepEqual(d.erase.mock.calls[0].arguments, [7]);
  });

  test('403 INVALID_PASSWORD sin borrar', async () => {
    const d = await build();
    const uc = makeDeleteAccount({ ...d, adminGuard: { isLastAdmin: async () => false } });
    await assert.rejects(uc({ userId: 7, password: 'mal' }), InvalidPasswordError);
    assert.equal(d.erase.mock.callCount(), 0);
  });

  test('409 LAST_ADMIN si IAM dice que es el unico ADMIN, sin borrar', async () => {
    const d = await build();
    const uc = makeDeleteAccount({ ...d, adminGuard: { isLastAdmin: async () => true } });
    await assert.rejects(uc({ userId: 7, password: OLD }), LastAdminAccountError);
    assert.equal(d.erase.mock.callCount(), 0);
  });

  test('409 LAST_ADMIN tambien si el adaptador lo detecta bajo bloqueo (carrera)', async () => {
    const d = await build();
    d.erase.mock.mockImplementation(async () => 'last_admin');
    const uc = makeDeleteAccount({ ...d, adminGuard: { isLastAdmin: async () => false } });
    await assert.rejects(uc({ userId: 7, password: OLD }), LastAdminAccountError);
  });
});

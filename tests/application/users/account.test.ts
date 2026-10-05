import { describe, expect, it, vi } from 'vitest';
import { makeChangePassword } from '../../../src/domains/users/application/change_password';
import { makeDeleteAccount } from '../../../src/domains/users/application/delete_account';
import {
  accountDomainService,
  AccountValidationError,
  InvalidPasswordError,
  LastAdminAccountError,
} from '../../../src/domains/users/domain/service';
import { User } from '../../../src/domains/users/domain/entity';
import { AccountRepository } from '../../../src/domains/users/domain/repository';
import { makeLogin } from '../../../src/domains/auth/application/login';
import { InvalidCredentialsError } from '../../../src/domains/auth/domain/service';
import { bcryptPasswordHasher } from '../../../src/domains/users/adapters/outbound/security/password';

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
    findById: vi.fn(async (id: number) => (id === user.userId ? user : null)),
    findByEmail: vi.fn(async (email: string) => (email === user.email ? user : null)),
    create: vi.fn(),
    deleteById: vi.fn(),
    updatePassword: vi.fn(),
  };
  const accountRepository: AccountRepository = {
    changePassword: vi.fn(async (_id, hash) => void (user.password = hash)),
    erase: vi.fn(async () => 'erased' as const),
  };
  return { user, userRepository, accountRepository, passwordHasher: bcryptPasswordHasher };
};

describe('reglas de la contraseña nueva', () => {
  const bad = (p: string) => expect(() => accountDomainService.ensureNewPasswordIsValid(p)).toThrow(AccountValidationError);
  it('acepta una contraseña que cumple todo', () => {
    expect(() => accountDomainService.ensureNewPasswordIsValid(NEW)).not.toThrow();
  });
  it('rechaza corta, sin mayuscula, sin minuscula, sin numero y sin simbolo', () => {
    bad('Ab.1xyz');
    bad('clave.nueva2');
    bad('CLAVE.NUEVA2');
    bad('Clave.Nueva');
    bad('ClaveNueva22');
  });
  it('rechaza mas de 72 bytes (no cuenta caracteres)', () => {
    bad('Aa.1' + 'x'.repeat(69)); // 73 bytes
    expect(() => accountDomainService.ensureNewPasswordIsValid('Aa.1' + 'x'.repeat(68))).not.toThrow(); // 72
    bad('Aa.1' + 'ñ'.repeat(35)); // 39 caracteres, 74 bytes
  });
});

describe('change_password', () => {
  it('con la actual correcta guarda un hash bcrypt nuevo y el login viejo deja de funcionar', async () => {
    const d = await build();
    const result = await makeChangePassword(d)({ userId: 7, currentPassword: OLD, newPassword: NEW });
    expect(result.success).toBe(true);
    expect(d.accountRepository.changePassword).toHaveBeenCalledOnce();
    expect(d.user.password).toMatch(/^\$2[aby]\$/);

    const login = makeLogin({
      userRepository: d.userRepository,
      passwordHasher: d.passwordHasher,
      tokenProvider: { sign: () => 'jwt', verify: vi.fn() },
      roleReader: { listRoleNames: async () => ['USER'] },
    });
    await expect(login({ email: 'ana@x.com', password: OLD })).rejects.toThrow(InvalidCredentialsError);
    await expect(login({ email: 'ana@x.com', password: NEW })).resolves.toMatchObject({ success: true });
  });

  it('403 INVALID_PASSWORD si la actual no coincide, sin guardar nada', async () => {
    const d = await build();
    await expect(makeChangePassword(d)({ userId: 7, currentPassword: 'otra', newPassword: NEW })).rejects.toThrow(InvalidPasswordError);
    expect(d.accountRepository.changePassword).not.toHaveBeenCalled();
  });

  it('400 si la nueva es igual a la actual', async () => {
    const d = await build();
    await expect(makeChangePassword(d)({ userId: 7, currentPassword: OLD, newPassword: OLD })).rejects.toThrow(AccountValidationError);
    expect(d.accountRepository.changePassword).not.toHaveBeenCalled();
  });

  it('400 si la nueva incumple las reglas, antes de tocar la base', async () => {
    const d = await build();
    await expect(makeChangePassword(d)({ userId: 7, currentPassword: OLD, newPassword: 'corta' })).rejects.toThrow(AccountValidationError);
    expect(d.userRepository.findById).not.toHaveBeenCalled();
  });

  it('cuenta sin contraseña (login social): 403 INVALID_PASSWORD', async () => {
    const d = await build({ password: null });
    await expect(makeChangePassword(d)({ userId: 7, currentPassword: OLD, newPassword: NEW })).rejects.toThrow(InvalidPasswordError);
  });
});

describe('delete_account', () => {
  it('con la contraseña correcta borra la cuenta', async () => {
    const d = await build();
    const r = await makeDeleteAccount({ ...d, adminGuard: { isLastAdmin: async () => false } })({ userId: 7, password: OLD });
    expect(r.success).toBe(true);
    expect(d.accountRepository.erase).toHaveBeenCalledWith(7);
  });

  it('403 INVALID_PASSWORD sin borrar', async () => {
    const d = await build();
    const uc = makeDeleteAccount({ ...d, adminGuard: { isLastAdmin: async () => false } });
    await expect(uc({ userId: 7, password: 'mal' })).rejects.toThrow(InvalidPasswordError);
    expect(d.accountRepository.erase).not.toHaveBeenCalled();
  });

  it('409 LAST_ADMIN si IAM dice que es el unico ADMIN, sin borrar', async () => {
    const d = await build();
    const uc = makeDeleteAccount({ ...d, adminGuard: { isLastAdmin: async () => true } });
    await expect(uc({ userId: 7, password: OLD })).rejects.toThrow(LastAdminAccountError);
    expect(d.accountRepository.erase).not.toHaveBeenCalled();
  });

  it('409 LAST_ADMIN tambien si el adaptador lo detecta bajo bloqueo (carrera)', async () => {
    const d = await build();
    (d.accountRepository.erase as ReturnType<typeof vi.fn>).mockResolvedValue('last_admin');
    const uc = makeDeleteAccount({ ...d, adminGuard: { isLastAdmin: async () => false } });
    await expect(uc({ userId: 7, password: OLD })).rejects.toThrow(LastAdminAccountError);
  });
});

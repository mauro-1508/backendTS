import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { makeForgotPassword } from '../../../src/domains/auth/application/forgot_password';
import { makeVerifyCode } from '../../../src/domains/auth/application/verify_code';
import { makeResetPassword } from '../../../src/domains/auth/application/reset_password';
import { makeLogin } from '../../../src/domains/auth/application/login';
import { DUMMY_HASH } from '../../../src/domains/auth/domain/service';
import { UserToken } from '../../../src/domains/auth/domain/entity';
import { AuthRepository } from '../../../src/domains/auth/domain/repository';

// Hasher rapido (sin bcrypt) para no alargar los tests.
const hasher = { hash: vi.fn(async (p: string) => `h:${p}`), compare: vi.fn(async (p: string, h: string) => h === `h:${p}`) };
const user = { userId: 7, name: 'Ana', email: 'ana@x.com', password: 'h:old' };

const setup = (start = new Date('2026-01-01T12:00:00Z')) => {
  let clock = start;
  const tokens: UserToken[] = [];
  const users = new Map([[user.email, { ...user }]]);
  let lock: Promise<void> = Promise.resolve();
  const issue: AuthRepository['issueTokenIfAllowed'] = async ({ userId, type, hashToken, expiresAt, now, decide }) => {
      const mine = tokens.filter((t) => t.userId === userId && t.tokenType === type);
      const last = mine.length ? mine[mine.length - 1].createdAt : null;
      const sent = mine.filter((t) => t.createdAt.getTime() >= now.getTime() - 3_600_000).length;
      const decision = decide(last, sent);
      if (decision !== 'ok') return decision;
      const tokenHash = await hashToken();
      mine.filter((t) => !t.usedAt && !t.revokedAt).forEach((t) => (t.revokedAt = now));
      tokens.push({ tokenId: tokens.length + 1, userId, tokenType: type, tokenHash, attempts: 0, expiresAt, usedAt: null, revokedAt: null, createdAt: now });
      return 'issued';
  };
  const authRepository: AuthRepository = {
    // Cola que simula el bloqueo FOR UPDATE por usuario de la transaccion real.
    issueTokenIfAllowed: (params) => {
      const run = lock.then(() => issue(params));
      lock = run.then(() => undefined, () => undefined);
      return run;
    },
    reserveAttempt: async (userId, type, now, max) => {
      const t = tokens.find(
        (x) => x.userId === userId && x.tokenType === type && !x.usedAt && !x.revokedAt && x.expiresAt > now && x.attempts < max
      );
      if (!t) return null;
      t.attempts++;
      return { ...t };
    },
    releaseAttempt: async (id) => {
      const t = tokens.find((x) => x.tokenId === id)!;
      t.attempts = Math.max(0, t.attempts - 1);
    },
    consumeAndResetPassword: async (id, userId, hash) => {
      const t = tokens.find((x) => x.tokenId === id)!;
      if (t.usedAt || t.revokedAt) return false;
      t.usedAt = clock;
      [...users.values()].find((u) => u.userId === userId)!.password = hash;
      return true;
    },
  };
  const userRepository = { findByEmail: async (e: string) => users.get(e) ?? null } as never;
  const sendPasswordResetCode = vi.fn().mockResolvedValue(undefined);
  const deps = {
    userRepository,
    authRepository,
    passwordHasher: hasher,
    mailer: { sendPasswordResetCode, sendVerificationCode: vi.fn() },
    now: () => clock,
  };
  return {
    tokens, users, authRepository, sendPasswordResetCode,
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    forgot: makeForgotPassword(deps),
    verify: makeVerifyCode(deps),
    reset: makeResetPassword(deps),
  };
};

const flush = () => new Promise((r) => setImmediate(r));

// Pide un codigo y lo captura del "correo".
const requestCode = async (ctx: ReturnType<typeof setup>) => {
  await ctx.forgot({ email: 'Ana@X.com' });
  await flush();
  return ctx.sendPasswordResetCode.mock.calls.at(-1)![0].code as string;
};

describe('forgot-password', () => {
  it('correo inexistente: misma respuesta y sin envio', async () => {
    const ctx = setup();
    const known = await ctx.forgot({ email: 'ana@x.com' });
    const unknown = await ctx.forgot({ email: 'nadie@x.com' });
    await flush();
    expect(unknown).toEqual(known);
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(1);
    expect(ctx.sendPasswordResetCode.mock.calls[0][0]).toMatchObject({ to: 'ana@x.com', name: 'Ana' });
  });

  it('dentro del cooldown no envia; pasado el cooldown si', async () => {
    const ctx = setup();
    await requestCode(ctx);
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(1);
    ctx.advance(60_000);
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(2);
  });

  it('hash del codigo solo con decision ok: cooldown o tope no lo calculan ni envian correo', async () => {
    const ctx = setup();
    hasher.hash.mockClear();
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    expect(hasher.hash).toHaveBeenCalledTimes(1);
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(1);

    // Cooldown
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    expect(hasher.hash).toHaveBeenCalledTimes(1);
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(1);

    // Tope horario: 4 envios mas hasta llegar a 5, el 6.o no hashea
    for (let i = 0; i < 4; i++) {
      ctx.advance(61_000);
      await ctx.forgot({ email: 'ana@x.com' });
      await flush();
    }
    expect(hasher.hash).toHaveBeenCalledTimes(5);
    ctx.advance(61_000);
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    expect(hasher.hash).toHaveBeenCalledTimes(5);
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(5);
  });

  it('maximo 5 envios por hora', async () => {
    const ctx = setup();
    for (let i = 0; i < 6; i++) {
      await ctx.forgot({ email: 'ana@x.com' });
      await flush();
      ctx.advance(61_000);
    }
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(5);
  });

  it('un fallo del correo no rompe la respuesta ni filtra datos al log', async () => {
    const ctx = setup();
    ctx.sendPasswordResetCode.mockRejectedValue(Object.assign(new Error('SMTP fail ana@x.com'), { code: 'ECONNECTION' }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(ctx.forgot({ email: 'ana@x.com' })).resolves.toMatchObject({ success: true });
    await flush();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('ana@x.com');
    expect(JSON.stringify(log.mock.calls)).toContain('ECONNECTION');
    log.mockRestore();
  });

  it('concurrencia: 10 peticiones en paralelo emiten y envian un solo codigo', async () => {
    const ctx = setup();
    await Promise.all(Array.from({ length: 10 }, () => ctx.forgot({ email: 'ana@x.com' })));
    await flush();
    expect(ctx.tokens).toHaveLength(1);
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(1);
  });

  it('un codigo nuevo revoca (no marca como usado) el anterior', async () => {
    const ctx = setup();
    await requestCode(ctx);
    ctx.advance(61_000);
    await requestCode(ctx);
    expect(ctx.tokens[0]).toMatchObject({ usedAt: null });
    expect(ctx.tokens[0].revokedAt).not.toBeNull();
    expect(ctx.tokens.filter((t) => !t.revokedAt && !t.usedAt)).toHaveLength(1);
  });
});

describe('verify-code y reset-password', () => {
  it('codigo correcto cambia la contrasena y deja el token usado', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    await expect(ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' })).resolves.toMatchObject({ success: true });
    expect(ctx.users.get('ana@x.com')!.password).toBe('h:nueva-clave-1');
    expect(ctx.tokens[0].usedAt).not.toBeNull();
  });

  it('segundo reset con el mismo codigo: INVALID_CODE', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    await ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' });
    await expect(ctx.reset({ email: 'ana@x.com', code, newPassword: 'otra-clave-22' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });

  it('carrera: si el consumo atomico devuelve false lanza INVALID_CODE', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    vi.spyOn(ctx.authRepository, 'consumeAndResetPassword').mockResolvedValue(false);
    await expect(ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(ctx.users.get('ana@x.com')!.password).toBe('h:old');
  });

  it('5 fallos agotan el codigo: el correcto tambien da INVALID_CODE (sin TOO_MANY_ATTEMPTS)', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    for (let i = 0; i < 5; i++) {
      await expect(ctx.verify({ email: 'ana@x.com', code: '000000' })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
    }
    expect(ctx.tokens[0].attempts).toBe(5);
    await expect(ctx.verify({ email: 'ana@x.com', code })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    await expect(ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(ctx.tokens[0].attempts).toBe(5);
  });

  it('concurrencia: 30 comparaciones paralelas no superan 5 intentos, ni con el codigo correcto entre ellas', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    const codes = Array.from({ length: 30 }, (_, i) => (i === 29 ? code : '000000'));
    const results = await Promise.allSettled(codes.map((c) => ctx.verify({ email: 'ana@x.com', code: c })));
    expect(ctx.tokens[0].attempts).toBeLessThanOrEqual(5);
    // Solo las 5 primeras reservas llegan a comparar: el correcto (el 30.o) queda fuera.
    expect(results.every((r) => r.status === 'rejected' && (r.reason as { code: string }).code === 'INVALID_CODE')).toBe(true);
  });

  it('un codigo correcto no gasta intento neto (verify + reset caben tras 4 fallos)', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    for (let i = 0; i < 4; i++) await ctx.verify({ email: 'ana@x.com', code: '000000' }).catch(() => {});
    await expect(ctx.verify({ email: 'ana@x.com', code })).resolves.toMatchObject({ success: true });
    await expect(ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' })).resolves.toMatchObject({ success: true });
  });

  it('codigo caducado: INVALID_CODE', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    ctx.advance(15 * 60 * 1000 + 1);
    await expect(ctx.verify({ email: 'ana@x.com', code })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
  });

  it('codigo revocado: INVALID_CODE; el codigo nuevo sigue valiendo', async () => {
    const ctx = setup();
    const first = await requestCode(ctx);
    ctx.advance(61_000);
    const second = await requestCode(ctx);
    await expect(ctx.verify({ email: 'ana@x.com', code: first })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    await expect(ctx.verify({ email: 'ana@x.com', code: second })).resolves.toMatchObject({ success: true });
  });

  it('correo desconocido: INVALID_CODE tras comparar contra DUMMY_HASH (igual que cuenta sin token)', async () => {
    const ctx = setup();
    hasher.compare.mockClear();
    await expect(ctx.verify({ email: 'x@x.com', code: '123456' })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
    expect(hasher.compare).toHaveBeenCalledWith('123456', DUMMY_HASH);
    hasher.compare.mockClear();
    await expect(ctx.verify({ email: 'ana@x.com', code: '123456' })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
    expect(hasher.compare).toHaveBeenCalledWith('123456', DUMMY_HASH);
  });
});

describe('login sin filtrar por tiempo', () => {
  const build = (found: unknown) => {
    const compare = vi.fn().mockResolvedValue(false);
    const login = makeLogin({
      userRepository: { findByEmail: async () => found } as never,
      passwordHasher: { hash: async () => 'x', compare },
      tokenProvider: { sign: () => 't' } as never,
    });
    return { login, compare };
  };

  it('sin usuario: compara una vez contra DUMMY_HASH y da INVALID_CREDENTIALS', async () => {
    const { login, compare } = build(null);
    await expect(login({ email: 'a@x.com', password: 'clave' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith('clave', DUMMY_HASH);
  });

  it('password null (cuenta Google): compara una vez y falla', async () => {
    const { login, compare } = build({ userId: 1, email: 'a@x.com', password: null });
    await expect(login({ email: 'a@x.com', password: 'clave' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('DUMMY_HASH es un bcrypt valido de coste 10', () => {
    expect(bcrypt.getRounds(DUMMY_HASH)).toBe(10);
  });
});

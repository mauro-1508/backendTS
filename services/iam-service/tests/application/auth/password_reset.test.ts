import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { makeForgotPassword } from '../../../src/auth/application/forgot_password';
import { makeVerifyCode } from '../../../src/auth/application/verify_code';
import { makeResetPassword } from '../../../src/auth/application/reset_password';
import { makeLogin } from '../../../src/auth/application/login';
import { DUMMY_HASH } from '../../../src/auth/domain/service';
import { UserToken } from '../../../src/auth/domain/entity';
import { AuthRepository } from '../../../src/auth/domain/repository';
import { argsOf, assertMatch, flush, rejectsWith, resolvesMatching } from '../../helpers/fakes';

// Hasher rapido (sin bcrypt) para no alargar los tests.
const hasher = {
  hash: mock.fn(async (p: string) => `h:${p}`),
  compare: mock.fn(async (p: string, h: string) => h === `h:${p}`),
};
const user = { userId: 7, name: 'Ana', email: 'ana@x.com', password: 'h:old', status: 'ACTIVE' as const };

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
        (x) => x.userId === userId && x.tokenType === type && !x.usedAt && !x.revokedAt && x.expiresAt > now && x.attempts < max,
      );
      if (!t) return null;
      t.attempts++;
      return { ...t };
    },
    releaseAttempt: async (id) => {
      const t = tokens.find((x) => x.tokenId === id)!;
      t.attempts = Math.max(0, t.attempts - 1);
    },
    consumeAndActivate: async () => true,
    consumeAndResetPassword: async (id, userId, hash) => {
      const t = tokens.find((x) => x.tokenId === id)!;
      if (t.usedAt || t.revokedAt) return false;
      t.usedAt = clock;
      [...users.values()].find((u) => u.userId === userId)!.password = hash;
      return true;
    },
  };
  const userRepository = { findByEmail: async (e: string) => users.get(e) ?? null } as never;
  const sendPasswordResetCode = mock.fn(async (_p: { to: string; name: string; code: string }) => undefined as void);
  const deps = {
    userRepository,
    authRepository,
    passwordHasher: hasher,
    mailer: { sendPasswordResetCode, sendVerificationCode: async () => undefined },
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

// Pide un codigo y lo captura del "correo".
const requestCode = async (ctx: ReturnType<typeof setup>) => {
  await ctx.forgot({ email: 'Ana@X.com' });
  await flush();
  return argsOf(ctx.sendPasswordResetCode)[0].code as string;
};

describe('forgot-password', () => {
  test('correo inexistente: misma respuesta y sin envio', async () => {
    const ctx = setup();
    const known = await ctx.forgot({ email: 'ana@x.com' });
    const unknown = await ctx.forgot({ email: 'nadie@x.com' });
    await flush();
    assert.deepEqual(unknown, known);
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 1);
    assertMatch(argsOf(ctx.sendPasswordResetCode, 0)[0], { to: 'ana@x.com', name: 'Ana' });
  });

  test('dentro del cooldown no envia; pasado el cooldown si', async () => {
    const ctx = setup();
    await requestCode(ctx);
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 1);
    ctx.advance(60_000);
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 2);
  });

  test('hash del codigo solo con decision ok: cooldown o tope no lo calculan ni envian correo', async () => {
    const ctx = setup();
    hasher.hash.mock.resetCalls();
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    assert.equal(hasher.hash.mock.callCount(), 1);
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 1);

    // Cooldown
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    assert.equal(hasher.hash.mock.callCount(), 1);
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 1);

    // Tope horario: 4 envios mas hasta llegar a 5, el sexto no hashea
    for (let i = 0; i < 4; i++) {
      ctx.advance(61_000);
      await ctx.forgot({ email: 'ana@x.com' });
      await flush();
    }
    assert.equal(hasher.hash.mock.callCount(), 5);
    ctx.advance(61_000);
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    assert.equal(hasher.hash.mock.callCount(), 5);
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 5);
  });

  test('maximo 5 envios por hora', async () => {
    const ctx = setup();
    for (let i = 0; i < 6; i++) {
      await ctx.forgot({ email: 'ana@x.com' });
      await flush();
      ctx.advance(61_000);
    }
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 5);
  });

  test('un fallo del correo no rompe la respuesta ni filtra datos al log', async () => {
    const ctx = setup();
    ctx.sendPasswordResetCode.mock.mockImplementation(async () => {
      throw Object.assign(new Error('SMTP fail ana@x.com'), { code: 'ECONNECTION' });
    });
    const log = mock.method(console, 'error', () => {});
    try {
      await resolvesMatching(ctx.forgot({ email: 'ana@x.com' }), { success: true });
      await flush();
      assert.equal(log.mock.callCount(), 1);
      const logged = JSON.stringify(log.mock.calls.map((c) => c.arguments));
      assert.ok(!logged.includes('ana@x.com'));
      assert.ok(logged.includes('ECONNECTION'));
    } finally {
      log.mock.restore();
    }
  });

  test('concurrencia: 10 peticiones en paralelo emiten y envian un solo codigo', async () => {
    const ctx = setup();
    await Promise.all(Array.from({ length: 10 }, () => ctx.forgot({ email: 'ana@x.com' })));
    await flush();
    assert.equal(ctx.tokens.length, 1);
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 1);
  });

  test('un codigo nuevo revoca (no marca como usado) el anterior', async () => {
    const ctx = setup();
    await requestCode(ctx);
    ctx.advance(61_000);
    await requestCode(ctx);
    assert.equal(ctx.tokens[0].usedAt, null);
    assert.notEqual(ctx.tokens[0].revokedAt, null);
    assert.equal(ctx.tokens.filter((t) => !t.revokedAt && !t.usedAt).length, 1);
  });
});

describe('verify-code y reset-password', () => {
  test('codigo correcto cambia la contrasena y deja el token usado', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    await resolvesMatching(ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' }), { success: true });
    assert.equal(ctx.users.get('ana@x.com')!.password, 'h:nueva-clave-1');
    assert.notEqual(ctx.tokens[0].usedAt, null);
  });

  test('segundo reset con el mismo codigo: INVALID_CODE', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    await ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' });
    await rejectsWith(ctx.reset({ email: 'ana@x.com', code, newPassword: 'otra-clave-22' }), { code: 'INVALID_CODE' });
  });

  test('carrera: si el consumo atomico devuelve false lanza INVALID_CODE', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    mock.method(ctx.authRepository, 'consumeAndResetPassword', async () => false);
    await rejectsWith(ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' }), { code: 'INVALID_CODE' });
    assert.equal(ctx.users.get('ana@x.com')!.password, 'h:old');
  });

  test('5 fallos agotan el codigo: el correcto tambien da INVALID_CODE (sin TOO_MANY_ATTEMPTS)', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    for (let i = 0; i < 5; i++) {
      await rejectsWith(ctx.verify({ email: 'ana@x.com', code: '000000' }), { code: 'INVALID_CODE', httpStatus: 400 });
    }
    assert.equal(ctx.tokens[0].attempts, 5);
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code }), { code: 'INVALID_CODE' });
    await rejectsWith(ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' }), { code: 'INVALID_CODE' });
    assert.equal(ctx.tokens[0].attempts, 5);
  });

  test('concurrencia: 30 comparaciones paralelas no superan 5 intentos, ni con el codigo correcto entre ellas', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    const codes = Array.from({ length: 30 }, (_, i) => (i === 29 ? code : '000000'));
    const results = await Promise.allSettled(codes.map((c) => ctx.verify({ email: 'ana@x.com', code: c })));
    assert.ok(ctx.tokens[0].attempts <= 5);
    // Solo las 5 primeras reservas llegan a comparar: el correcto (el 30.o) queda fuera.
    assert.ok(results.every((r) => r.status === 'rejected' && (r.reason as { code: string }).code === 'INVALID_CODE'));
  });

  test('un codigo correcto no gasta intento neto (verify + reset caben tras 4 fallos)', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    for (let i = 0; i < 4; i++) await ctx.verify({ email: 'ana@x.com', code: '000000' }).catch(() => {});
    await resolvesMatching(ctx.verify({ email: 'ana@x.com', code }), { success: true });
    await resolvesMatching(ctx.reset({ email: 'ana@x.com', code, newPassword: 'nueva-clave-1' }), { success: true });
  });

  test('codigo caducado: INVALID_CODE', async () => {
    const ctx = setup();
    const code = await requestCode(ctx);
    ctx.advance(15 * 60 * 1000 + 1);
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code }), { code: 'INVALID_CODE', httpStatus: 400 });
  });

  test('codigo revocado: INVALID_CODE; el codigo nuevo sigue valiendo', async () => {
    const ctx = setup();
    const first = await requestCode(ctx);
    ctx.advance(61_000);
    const second = await requestCode(ctx);
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code: first }), { code: 'INVALID_CODE' });
    await resolvesMatching(ctx.verify({ email: 'ana@x.com', code: second }), { success: true });
  });

  test('correo desconocido: INVALID_CODE tras comparar contra DUMMY_HASH (igual que cuenta sin token)', async () => {
    const ctx = setup();
    const comparedWithDummy = () =>
      hasher.compare.mock.calls.some((c) => c.arguments[0] === '123456' && c.arguments[1] === DUMMY_HASH);
    hasher.compare.mock.resetCalls();
    await rejectsWith(ctx.verify({ email: 'x@x.com', code: '123456' }), { code: 'INVALID_CODE', httpStatus: 400 });
    assert.ok(comparedWithDummy());
    hasher.compare.mock.resetCalls();
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code: '123456' }), { code: 'INVALID_CODE', httpStatus: 400 });
    assert.ok(comparedWithDummy());
  });
});

describe('login sin filtrar por tiempo', () => {
  const build = (found: unknown) => {
    const compare = mock.fn(async (_p: string, _h: string) => false);
    const login = makeLogin({
      userRepository: { findByEmail: async () => found } as never,
      passwordHasher: { hash: async () => 'x', compare },
      tokenProvider: { sign: () => 't', verify: () => ({}) as never },
      roleReader: { readAccess: async () => ({ roles: ['USER'], permissions: [] }) },
    });
    return { login, compare };
  };

  test('sin usuario: compara una vez contra DUMMY_HASH y da INVALID_CREDENTIALS', async () => {
    const { login, compare } = build(null);
    await rejectsWith(login({ email: 'a@x.com', password: 'clave' }), { code: 'INVALID_CREDENTIALS' });
    assert.equal(compare.mock.callCount(), 1);
    assert.deepEqual(argsOf(compare), ['clave', DUMMY_HASH]);
  });

  test('password null (cuenta Google): compara una vez y falla', async () => {
    const { login, compare } = build({ userId: 1, email: 'a@x.com', password: null, status: 'ACTIVE' });
    await rejectsWith(login({ email: 'a@x.com', password: 'clave' }), { code: 'INVALID_CREDENTIALS' });
    assert.equal(compare.mock.callCount(), 1);
  });

  test('DUMMY_HASH es un bcrypt valido de coste 10', () => {
    assert.equal(bcrypt.getRounds(DUMMY_HASH), 10);
  });
});

import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeRegister } from '../../../src/auth/application/register';
import { makeVerifyEmail } from '../../../src/auth/application/verify_email';
import { makeResendVerification } from '../../../src/auth/application/resend_verification';
import { makeLogin } from '../../../src/auth/application/login';
import { makeForgotPassword } from '../../../src/auth/application/forgot_password';
import { makeResetPassword } from '../../../src/auth/application/reset_password';
import { makeGoogleLogin } from '../../../src/auth/application/google_login';
import { AuthError, DUMMY_HASH } from '../../../src/auth/domain/service';
import { UserToken } from '../../../src/auth/domain/entity';
import { AuthRepository } from '../../../src/auth/domain/repository';
import { makeAuthController } from '../../../src/auth/adapters/inbound/http/auth_controller';
import { makeAuthRoutes } from '../../../src/auth/adapters/inbound/http/routes';
import { assertMatch, argsOf, fakeRes, flush, rejectsWith, resolvesMatching, RecordingEventPublisher } from '../../helpers/fakes';

type U = {
  userId: number;
  name: string;
  email: string;
  password: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  emailVerifiedAt: Date | null;
};

const hasher = {
  hash: mock.fn(async (p: string) => `h:${p}`),
  compare: mock.fn(async (p: string, h: string) => h === `h:${p}`),
};

const setup = (users: U[] = []) => {
  let clock = new Date('2026-01-01T12:00:00Z');
  const tokens: UserToken[] = [];
  const db = new Map(users.map((u) => [u.email, { ...u }]));
  let nextId = 100;
  const authRepository: AuthRepository = {
    issueTokenIfAllowed: async ({ userId, type, hashToken, expiresAt, now, decide }) => {
      const mine = tokens.filter((t) => t.userId === userId && t.tokenType === type);
      const last = mine.length ? mine[mine.length - 1].createdAt : null;
      const sent = mine.filter((t) => t.createdAt.getTime() >= now.getTime() - 3_600_000).length;
      const decision = decide(last, sent);
      if (decision !== 'ok') return decision;
      const tokenHash = await hashToken();
      mine.filter((t) => !t.usedAt && !t.revokedAt).forEach((t) => (t.revokedAt = now));
      tokens.push({ tokenId: tokens.length + 1, userId, tokenType: type, tokenHash, attempts: 0, expiresAt, usedAt: null, revokedAt: null, createdAt: now });
      return 'issued';
    },
    reserveAttempt: async (userId, type, now, max) => {
      const t = tokens.find((x) => x.userId === userId && x.tokenType === type && !x.usedAt && !x.revokedAt && x.expiresAt > now && x.attempts < max);
      if (!t) return null;
      t.attempts++;
      return { ...t };
    },
    releaseAttempt: async () => undefined,
    consumeAndResetPassword: async (id, userId, hash) => {
      const t = tokens.find((x) => x.tokenId === id)!;
      if (t.usedAt || t.revokedAt) return false;
      t.usedAt = clock;
      const u = [...db.values()].find((x) => x.userId === userId)!;
      u.password = hash;
      if (u.status === 'INACTIVE') {
        u.status = 'ACTIVE';
        u.emailVerifiedAt = clock;
      }
      tokens.filter((x) => x.userId === userId && x.tokenType === 'EMAIL_VERIFICATION' && !x.usedAt && !x.revokedAt).forEach((x) => (x.revokedAt = clock));
      return true;
    },
    consumeAndActivate: async (id, userId) => {
      const t = tokens.find((x) => x.tokenId === id)!;
      if (t.usedAt || t.revokedAt) return false;
      t.usedAt = clock;
      const u = [...db.values()].find((x) => x.userId === userId)!;
      u.status = 'ACTIVE';
      u.emailVerifiedAt = clock;
      return true;
    },
  };
  const deleteById = mock.fn(async (id: number) => {
    for (const [k, u] of db) if (u.userId === id) db.delete(k);
  });
  const userRepository = {
    findByEmail: async (e: string) => db.get(e) ?? null,
    create: async (n: { name: string; email: string; password: string | null; status?: U['status']; emailVerifiedAt?: Date | null }) => {
      const u: U = { userId: nextId++, name: n.name, email: n.email, password: n.password, status: n.status ?? 'INACTIVE', emailVerifiedAt: n.emailVerifiedAt ?? null };
      db.set(u.email, u);
      return u;
    },
    deleteById,
  } as never;
  const sendVerificationCode = mock.fn(async (_p: { to: string; name: string; code: string }) => undefined as void);
  const sendPasswordResetCode = mock.fn(async (_p: { to: string; name: string; code: string }) => undefined as void);
  const assignDefaultRole = mock.fn(async (_id: number) => undefined as void);
  const eventPublisher = new RecordingEventPublisher();
  const deps = {
    userRepository,
    authRepository,
    passwordHasher: hasher,
    mailer: { sendVerificationCode, sendPasswordResetCode },
    roleAssigner: { assignDefaultRole },
    roleReader: { readAccess: async () => ({ roles: ['USER'], permissions: ['translation.create'] }) },
    tokenProvider: { sign: () => 'jwt', verify: () => ({}) as never },
    eventPublisher,
    now: () => clock,
  };
  return {
    db, tokens, authRepository, deleteById, sendVerificationCode, sendPasswordResetCode, assignDefaultRole, eventPublisher,
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    register: makeRegister(deps),
    verify: makeVerifyEmail(deps),
    resend: makeResendVerification(deps),
    login: makeLogin(deps),
    forgot: makeForgotPassword(deps),
    reset: makeResetPassword(deps),
    googleLogin: makeGoogleLogin(deps),
  };
};

const ana: U = { userId: 7, name: 'Ana', email: 'ana@x.com', password: 'h:clave-larga', status: 'INACTIVE', emailVerifiedAt: null };
const input = { name: 'Ana', email: 'Ana@X.com', password: 'clave-larga' };
const codeOf = (ctx: ReturnType<typeof setup>) => argsOf(ctx.sendVerificationCode)[0].code as string;
const INVALID_CODE = { code: 'INVALID_CODE', httpStatus: 400 };

describe('register con verificacion de correo', () => {
  test('crea INACTIVE, sin token, emite EMAIL_VERIFICATION y envia 6 digitos', async () => {
    const ctx = setup();
    const result = await ctx.register(input);
    assert.deepEqual(result.data, { user_id: 100, name: 'Ana', email: 'ana@x.com', status: 'INACTIVE', verification_email_sent: true });
    assert.doesNotMatch(JSON.stringify(result), /token|code/i);
    assert.equal(ctx.db.get('ana@x.com')!.status, 'INACTIVE');
    assert.equal(ctx.tokens.length, 1);
    assertMatch(ctx.tokens[0], { tokenType: 'EMAIL_VERIFICATION', userId: 100 });
    assertMatch(argsOf(ctx.sendVerificationCode, 0)[0], { to: 'ana@x.com', name: 'Ana', code: /^\d{6}$/ });
    assert.deepEqual(argsOf(ctx.assignDefaultRole), [100]);
  });

  test('publica iam.UserRegistered con el usuario creado', async () => {
    const ctx = setup();
    await ctx.register(input);
    assert.deepEqual(ctx.eventPublisher.published, [
      { type: 'iam.UserRegistered', payload: { userId: 100, email: 'ana@x.com', name: 'Ana' } },
    ]);
  });

  test('si el correo falla: verification_email_sent false, usuario conservado y log sin datos', async () => {
    const ctx = setup();
    ctx.sendVerificationCode.mock.mockImplementation(async () => {
      throw Object.assign(new Error('SMTP ana@x.com'), { code: 'ECONNECTION' });
    });
    const log = mock.method(console, 'error', () => {});
    try {
      const result = await ctx.register(input);
      assertMatch(result.data, { status: 'INACTIVE', verification_email_sent: false });
      assert.equal(ctx.deleteById.mock.callCount(), 0);
      assert.ok(ctx.db.has('ana@x.com'));
      assert.ok(!JSON.stringify(log.mock.calls.map((c) => c.arguments)).includes('ana@x.com'));
    } finally {
      log.mock.restore();
    }
  });

  test('correo duplicado (sin distinguir mayusculas): EMAIL_ALREADY_EXISTS 409', async () => {
    const ctx = setup([ana]);
    await rejectsWith(ctx.register(input), { code: 'EMAIL_ALREADY_EXISTS', httpStatus: 409 });
  });

  test('si falla el rol se compensa borrando el usuario y no se envia nada ni se publica', async () => {
    const ctx = setup();
    ctx.assignDefaultRole.mock.mockImplementation(async () => { throw new Error('boom'); });
    await assert.rejects(ctx.register(input), /No se pudo completar el registro/);
    assert.deepEqual(argsOf(ctx.deleteById), [100]);
    assert.equal(ctx.sendVerificationCode.mock.callCount(), 0);
    assert.equal(ctx.eventPublisher.published.length, 0);
  });
});

describe('verify-email', () => {
  test('codigo valido: activa la cuenta y fija emailVerifiedAt', async () => {
    const ctx = setup();
    await ctx.register(input);
    await resolvesMatching(ctx.verify({ email: 'ANA@x.com', code: codeOf(ctx), password: 'clave-larga' }), { success: true });
    assertMatch(ctx.db.get('ana@x.com'), { status: 'ACTIVE' });
    assert.notEqual(ctx.db.get('ana@x.com')!.emailVerifiedAt, null);
  });

  test('incorrecto, reutilizado, desconocido y ya activa: INVALID_CODE 400 (ya activa compara DUMMY_HASH)', async () => {
    const ctx = setup([{ ...ana, userId: 8, name: 'Bea', email: 'bea@x.com', status: 'ACTIVE' }]);
    await ctx.register(input);
    const code = codeOf(ctx);
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code: '000000', password: 'clave-larga' }), INVALID_CODE);
    await ctx.verify({ email: 'ana@x.com', code, password: 'clave-larga' });
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code, password: 'clave-larga' }), { code: 'INVALID_CODE' });
    await rejectsWith(ctx.verify({ email: 'nadie@x.com', code, password: 'clave-larga' }), { code: 'INVALID_CODE' });
    hasher.compare.mock.resetCalls();
    await rejectsWith(ctx.verify({ email: 'bea@x.com', code, password: 'clave-larga' }), { code: 'INVALID_CODE' });
    assert.ok(hasher.compare.mock.calls.some((c) => c.arguments[0] === code && c.arguments[1] === DUMMY_HASH));
    assert.equal(hasher.compare.mock.callCount(), 2);
  });

  test('codigo caducado: INVALID_CODE', async () => {
    const ctx = setup();
    await ctx.register(input);
    const code = codeOf(ctx);
    ctx.advance(15 * 60 * 1000 + 1);
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code, password: 'clave-larga' }), { code: 'INVALID_CODE' });
    assert.equal(ctx.db.get('ana@x.com')!.status, 'INACTIVE');
  });

  test('5 intentos agotan el codigo: el correcto tambien da INVALID_CODE', async () => {
    const ctx = setup();
    await ctx.register(input);
    const code = codeOf(ctx);
    for (let i = 0; i < 5; i++) await ctx.verify({ email: 'ana@x.com', code: '000000', password: 'clave-larga' }).catch(() => {});
    assert.equal(ctx.tokens[0].attempts, 5);
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code, password: 'clave-larga' }), { code: 'INVALID_CODE' });
    assert.equal(ctx.db.get('ana@x.com')!.status, 'INACTIVE');
  });

  test('carrera: si consumeAndActivate devuelve false lanza INVALID_CODE', async () => {
    const ctx = setup();
    await ctx.register(input);
    mock.method(ctx.authRepository, 'consumeAndActivate', async () => false);
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code: codeOf(ctx), password: 'clave-larga' }), { code: 'INVALID_CODE' });
  });
});

describe('resend-verification', () => {
  test('respuesta identica en los 4 casos; solo en ok se hashea y envia', async () => {
    const ctx = setup([{ ...ana }, { ...ana, userId: 8, name: 'Bea', email: 'bea@x.com', status: 'ACTIVE' }]);
    hasher.hash.mock.resetCalls();
    const ok = await ctx.resend({ email: 'ana@x.com' });
    await flush();
    assert.equal(ctx.sendVerificationCode.mock.callCount(), 1);
    assert.equal(hasher.hash.mock.callCount(), 1);
    const cooldown = await ctx.resend({ email: 'ana@x.com' });
    const unknown = await ctx.resend({ email: 'nadie@x.com' });
    const active = await ctx.resend({ email: 'bea@x.com' });
    await flush();
    assert.deepEqual([cooldown, unknown, active], [ok, ok, ok]);
    assert.equal(ctx.sendVerificationCode.mock.callCount(), 1);
    assert.equal(hasher.hash.mock.callCount(), 1);
  });

  test('el sexto envio en una hora no envia', async () => {
    const ctx = setup([{ ...ana }]);
    for (let i = 0; i < 6; i++) {
      await ctx.resend({ email: 'ana@x.com' });
      await flush();
      ctx.advance(61_000);
    }
    assert.equal(ctx.sendVerificationCode.mock.callCount(), 5);
  });
});

describe('login segun estado', () => {
  const build = (status: U['status']) => setup([{ ...ana, status }]);

  test('contrasena correcta: ACTIVE entra, INACTIVE 403 EMAIL_NOT_VERIFIED, BLOCKED 403 ACCOUNT_BLOCKED', async () => {
    const creds = { email: 'ana@x.com', password: 'clave-larga' };
    await resolvesMatching(build('ACTIVE').login(creds), { data: { token: 'jwt' } });
    await rejectsWith(build('INACTIVE').login(creds), { code: 'EMAIL_NOT_VERIFIED', httpStatus: 403 });
    await rejectsWith(build('BLOCKED').login(creds), { code: 'ACCOUNT_BLOCKED', httpStatus: 403 });
  });

  test('contrasena incorrecta: INVALID_CREDENTIALS sea cual sea el estado', async () => {
    for (const status of ['ACTIVE', 'INACTIVE', 'BLOCKED'] as const) {
      await rejectsWith(build(status).login({ email: 'ana@x.com', password: 'mala' }), { code: 'INVALID_CREDENTIALS' });
    }
  });
});

describe('forgot-password segun estado', () => {
  test('ACTIVE e INACTIVE reciben codigo; BLOCKED no; la respuesta es la misma', async () => {
    const active = setup([{ ...ana, status: 'ACTIVE' }]);
    const inactive = setup([{ ...ana, status: 'INACTIVE' }]);
    const blocked = setup([{ ...ana, status: 'BLOCKED' }]);
    const a = await active.forgot({ email: 'ana@x.com' });
    const i = await inactive.forgot({ email: 'ana@x.com' });
    const b = await blocked.forgot({ email: 'ana@x.com' });
    await flush();
    assert.deepEqual(i, a);
    assert.deepEqual(b, a);
    assert.equal(active.sendPasswordResetCode.mock.callCount(), 1);
    assert.equal(inactive.sendPasswordResetCode.mock.callCount(), 1);
    assert.equal(blocked.sendPasswordResetCode.mock.callCount(), 0);
  });
});

describe('verify-email exige la contrasena', () => {
  test('codigo correcto y contrasena incorrecta: INVALID_CODE, no activa y cuenta el intento', async () => {
    const ctx = setup();
    await ctx.register(input);
    hasher.compare.mock.resetCalls();
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code: codeOf(ctx), password: 'otra-clave' }), INVALID_CODE);
    assert.equal(hasher.compare.mock.callCount(), 2);
    assert.equal(ctx.db.get('ana@x.com')!.status, 'INACTIVE');
    assert.equal(ctx.tokens[0].attempts, 1);
    await resolvesMatching(ctx.verify({ email: 'ana@x.com', code: codeOf(ctx), password: 'clave-larga' }), { success: true });
    assert.equal(ctx.db.get('ana@x.com')!.status, 'ACTIVE');
  });

  test('cuenta BLOCKED: INVALID_CODE y sigue BLOCKED', async () => {
    const ctx = setup([{ ...ana, status: 'BLOCKED' }]);
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code: '123456', password: 'clave-larga' }), { code: 'INVALID_CODE' });
    assert.equal(ctx.db.get('ana@x.com')!.status, 'BLOCKED');
  });
});

describe('pre-account hijacking', () => {
  test('atacante registra con P; la victima recupera y activa con su contrasena; P ya no sirve', async () => {
    const ctx = setup();
    await ctx.register({ name: 'Ana', email: 'ana@x.com', password: 'clave-atacante' });
    const verificationCode = codeOf(ctx);
    ctx.advance(61_000);
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    assert.equal(ctx.sendPasswordResetCode.mock.callCount(), 1);
    const resetCode = argsOf(ctx.sendPasswordResetCode, 0)[0].code as string;
    await resolvesMatching(ctx.reset({ email: 'ana@x.com', code: resetCode, newPassword: 'clave-victima' }), { success: true });

    const user = ctx.db.get('ana@x.com')!;
    assert.equal(user.status, 'ACTIVE');
    assert.notEqual(user.emailVerifiedAt, null);
    assert.equal(user.password, 'h:clave-victima');
    assert.ok(ctx.tokens.filter((t) => t.tokenType === 'EMAIL_VERIFICATION').every((t) => t.revokedAt || t.usedAt));
    await rejectsWith(ctx.login({ email: 'ana@x.com', password: 'clave-atacante' }), { code: 'INVALID_CREDENTIALS' });
    await resolvesMatching(ctx.login({ email: 'ana@x.com', password: 'clave-victima' }), { data: { token: 'jwt' } });
    await rejectsWith(ctx.verify({ email: 'ana@x.com', code: verificationCode, password: 'clave-victima' }), { code: 'INVALID_CODE' });
  });
});

describe('google_login segun estado', () => {
  test('existente INACTIVE: EMAIL_NOT_VERIFIED; BLOCKED: ACCOUNT_BLOCKED', async () => {
    await rejectsWith(setup([{ ...ana, status: 'INACTIVE' }]).googleLogin({ email: 'Ana@x.com', name: 'Ana' }), { code: 'EMAIL_NOT_VERIFIED', httpStatus: 403 });
    await rejectsWith(setup([{ ...ana, status: 'BLOCKED' }]).googleLogin({ email: 'ana@x.com', name: 'Ana' }), { code: 'ACCOUNT_BLOCKED', httpStatus: 403 });
  });

  test('cuenta nueva: se crea ACTIVE con emailVerifiedAt y se publica iam.UserRegistered', async () => {
    const ctx = setup();
    await resolvesMatching(ctx.googleLogin({ email: 'nueva@x.com', name: 'Nueva' }), { data: { token: 'jwt' } });
    assertMatch(ctx.db.get('nueva@x.com'), { status: 'ACTIVE' });
    assert.ok(ctx.db.get('nueva@x.com')!.emailVerifiedAt instanceof Date);
    assert.deepEqual(ctx.eventPublisher.published, [
      { type: 'iam.UserRegistered', payload: { userId: 100, email: 'nueva@x.com', name: 'Nueva' } },
    ]);
  });

  test('cuenta existente ACTIVE: inicia sesion sin publicar evento', async () => {
    const ctx = setup([{ ...ana, status: 'ACTIVE' }]);
    await resolvesMatching(ctx.googleLogin({ email: 'ana@x.com', name: 'Ana' }), { data: { token: 'jwt' } });
    assert.equal(ctx.eventPublisher.published.length, 0);
  });
});

describe('HTTP: rutas y codigos', () => {
  const verifyEmail = mock.fn(async (_i: unknown) => ({ success: true, message: 'ok' }));
  const resendVerification = mock.fn(async (_i: unknown) => ({ success: true, message: 'ok' }));
  const login = mock.fn(async (_i: unknown): Promise<unknown> => ({}));
  const service = { verifyEmail, resendVerification, login } as never;
  const c = makeAuthController(service);

  test('registra POST /verify-email y /resend-verification', () => {
    const layers = (makeAuthRoutes(service) as unknown as { stack: { route: { path: string; methods: Record<string, boolean> } }[] }).stack;
    for (const path of ['/verify-email', '/resend-verification']) {
      assert.equal(layers.find((l) => l.route.path === path)?.route.methods.post, true, path);
    }
  });

  test('verify-email y resend-verification: 200; body invalido: 400 INVALID_BODY', async () => {
    const ok = fakeRes();
    await c.verifyEmail({ body: { email: ' A@X.com ', code: '123456', password: 'clave' } } as never, ok, mock.fn() as never);
    assert.deepEqual(argsOf(ok.status), [200]);
    assert.deepEqual(argsOf(verifyEmail), [{ email: 'a@x.com', code: '123456', password: 'clave' }]);

    const bad = fakeRes();
    await c.verifyEmail({ body: { email: 'a@x.com', code: '12', password: 'clave' } } as never, bad, mock.fn() as never);
    assert.deepEqual(argsOf(bad.status), [400]);
    assertMatch(argsOf(bad.json)[0], { code: 'INVALID_BODY' });

    const noPass = fakeRes();
    await c.verifyEmail({ body: { email: 'a@x.com', code: '123456' } } as never, noPass, mock.fn() as never);
    assert.deepEqual(argsOf(noPass.status), [400]);

    const rs = fakeRes();
    await c.resendVerification({ body: { email: 'a@x.com' } } as never, rs, mock.fn() as never);
    assert.deepEqual(argsOf(rs.status), [200]);
  });

  test('login: EMAIL_NOT_VERIFIED y ACCOUNT_BLOCKED -> 403 con code', async () => {
    for (const code of ['EMAIL_NOT_VERIFIED', 'ACCOUNT_BLOCKED']) {
      login.mock.mockImplementationOnce(async () => { throw new AuthError('m', code, 403); });
      const r = fakeRes();
      await c.login({ body: { email: 'a@x.com', password: 'x' } } as never, r, mock.fn() as never);
      assert.deepEqual(argsOf(r.status), [403]);
      assertMatch(argsOf(r.json)[0], { success: false, code });
    }
  });
});

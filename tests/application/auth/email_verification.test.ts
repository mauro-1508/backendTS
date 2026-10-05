import { describe, expect, it, vi } from 'vitest';
import { makeRegister } from '../../../src/domains/auth/application/register';
import { makeVerifyEmail } from '../../../src/domains/auth/application/verify_email';
import { makeResendVerification } from '../../../src/domains/auth/application/resend_verification';
import { makeLogin } from '../../../src/domains/auth/application/login';
import { makeForgotPassword } from '../../../src/domains/auth/application/forgot_password';
import { makeResetPassword } from '../../../src/domains/auth/application/reset_password';
import { makeGoogleLogin } from '../../../src/domains/auth/application/google_login';
import { AuthError, DUMMY_HASH } from '../../../src/domains/auth/domain/service';
import { UserToken } from '../../../src/domains/auth/domain/entity';
import { AuthRepository } from '../../../src/domains/auth/domain/repository';
import { makeAuthController } from '../../../src/domains/auth/adapters/inbound/http/auth_controller';
import { makeAuthRoutes } from '../../../src/domains/auth/adapters/inbound/http/routes';

type U = {
  userId: number;
  name: string;
  email: string;
  password: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  emailVerifiedAt: Date | null;
};

const hasher = { hash: vi.fn(async (p: string) => `h:${p}`), compare: vi.fn(async (p: string, h: string) => h === `h:${p}`) };
const flush = () => new Promise((r) => setImmediate(r));

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
  const deleteById = vi.fn(async (id: number) => {
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
  const sendVerificationCode = vi.fn().mockResolvedValue(undefined);
  const sendPasswordResetCode = vi.fn().mockResolvedValue(undefined);
  const assignDefaultRole = vi.fn().mockResolvedValue(undefined);
  const deps = {
    userRepository,
    authRepository,
    passwordHasher: hasher,
    mailer: { sendVerificationCode, sendPasswordResetCode },
    roleAssigner: { assignDefaultRole },
    roleReader: { listRoleNames: async () => ['USER'] },
    tokenProvider: { sign: () => 'jwt' } as never,
    now: () => clock,
  };
  return {
    db, tokens, authRepository, deleteById, sendVerificationCode, sendPasswordResetCode, assignDefaultRole,
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
const codeOf = (ctx: ReturnType<typeof setup>) => ctx.sendVerificationCode.mock.calls.at(-1)![0].code as string;

describe('register con verificacion de correo', () => {
  it('crea INACTIVE, sin token, emite EMAIL_VERIFICATION y envia 6 digitos', async () => {
    const ctx = setup();
    const result = await ctx.register(input);
    expect(result.data).toEqual({ user_id: 100, name: 'Ana', email: 'ana@x.com', status: 'INACTIVE', verification_email_sent: true });
    expect(JSON.stringify(result)).not.toMatch(/token|code/i);
    expect(ctx.db.get('ana@x.com')!.status).toBe('INACTIVE');
    expect(ctx.tokens).toHaveLength(1);
    expect(ctx.tokens[0]).toMatchObject({ tokenType: 'EMAIL_VERIFICATION', userId: 100 });
    expect(ctx.sendVerificationCode.mock.calls[0][0]).toMatchObject({ to: 'ana@x.com', name: 'Ana', code: expect.stringMatching(/^\d{6}$/) });
    expect(ctx.assignDefaultRole).toHaveBeenCalledWith(100);
  });

  it('si el correo falla: verification_email_sent false, usuario conservado y log sin datos', async () => {
    const ctx = setup();
    ctx.sendVerificationCode.mockRejectedValue(Object.assign(new Error('SMTP ana@x.com'), { code: 'ECONNECTION' }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await ctx.register(input);
    expect(result.data).toMatchObject({ status: 'INACTIVE', verification_email_sent: false });
    expect(ctx.deleteById).not.toHaveBeenCalled();
    expect(ctx.db.has('ana@x.com')).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain('ana@x.com');
    log.mockRestore();
  });

  it('correo duplicado (sin distinguir mayusculas): EMAIL_ALREADY_EXISTS 409', async () => {
    const ctx = setup([ana]);
    await expect(ctx.register(input)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', httpStatus: 409 });
  });

  it('si falla el rol se compensa borrando el usuario y no se envia nada', async () => {
    const ctx = setup();
    ctx.assignDefaultRole.mockRejectedValue(new Error('boom'));
    await expect(ctx.register(input)).rejects.toThrow('No se pudo completar el registro');
    expect(ctx.deleteById).toHaveBeenCalledWith(100);
    expect(ctx.sendVerificationCode).not.toHaveBeenCalled();
  });
});

describe('verify-email', () => {
  it('codigo valido: activa la cuenta y fija emailVerifiedAt', async () => {
    const ctx = setup();
    await ctx.register(input);
    await expect(ctx.verify({ email: 'ANA@x.com', code: codeOf(ctx), password: 'clave-larga' })).resolves.toMatchObject({ success: true });
    expect(ctx.db.get('ana@x.com')).toMatchObject({ status: 'ACTIVE' });
    expect(ctx.db.get('ana@x.com')!.emailVerifiedAt).not.toBeNull();
  });

  it('incorrecto, reutilizado, desconocido y ya activa: INVALID_CODE 400 (ya activa compara DUMMY_HASH)', async () => {
    const ctx = setup([{ ...ana, userId: 8, name: 'Bea', email: 'bea@x.com', status: 'ACTIVE' }]);
    await ctx.register(input);
    const code = codeOf(ctx);
    await expect(ctx.verify({ email: 'ana@x.com', code: '000000', password: 'clave-larga' })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
    await ctx.verify({ email: 'ana@x.com', code, password: 'clave-larga' });
    await expect(ctx.verify({ email: 'ana@x.com', code, password: 'clave-larga' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    await expect(ctx.verify({ email: 'nadie@x.com', code, password: 'clave-larga' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    hasher.compare.mockClear();
    await expect(ctx.verify({ email: 'bea@x.com', code, password: 'clave-larga' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(hasher.compare).toHaveBeenCalledWith(code, DUMMY_HASH);
    expect(hasher.compare).toHaveBeenCalledTimes(2);
  });

  it('codigo caducado: INVALID_CODE', async () => {
    const ctx = setup();
    await ctx.register(input);
    const code = codeOf(ctx);
    ctx.advance(15 * 60 * 1000 + 1);
    await expect(ctx.verify({ email: 'ana@x.com', code, password: 'clave-larga' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(ctx.db.get('ana@x.com')!.status).toBe('INACTIVE');
  });

  it('5 intentos agotan el codigo: el correcto tambien da INVALID_CODE', async () => {
    const ctx = setup();
    await ctx.register(input);
    const code = codeOf(ctx);
    for (let i = 0; i < 5; i++) await ctx.verify({ email: 'ana@x.com', code: '000000', password: 'clave-larga' }).catch(() => {});
    expect(ctx.tokens[0].attempts).toBe(5);
    await expect(ctx.verify({ email: 'ana@x.com', code, password: 'clave-larga' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(ctx.db.get('ana@x.com')!.status).toBe('INACTIVE');
  });

  it('carrera: si consumeAndActivate devuelve false lanza INVALID_CODE', async () => {
    const ctx = setup();
    await ctx.register(input);
    vi.spyOn(ctx.authRepository, 'consumeAndActivate').mockResolvedValue(false);
    await expect(ctx.verify({ email: 'ana@x.com', code: codeOf(ctx), password: 'clave-larga' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });
});

describe('resend-verification', () => {
  it('respuesta identica en los 4 casos; solo en ok se hashea y envia', async () => {
    const ctx = setup([{ ...ana }, { ...ana, userId: 8, name: 'Bea', email: 'bea@x.com', status: 'ACTIVE' }]);
    hasher.hash.mockClear();
    const ok = await ctx.resend({ email: 'ana@x.com' });
    await flush();
    expect(ctx.sendVerificationCode).toHaveBeenCalledTimes(1);
    expect(hasher.hash).toHaveBeenCalledTimes(1);
    const cooldown = await ctx.resend({ email: 'ana@x.com' });
    const unknown = await ctx.resend({ email: 'nadie@x.com' });
    const active = await ctx.resend({ email: 'bea@x.com' });
    await flush();
    expect([cooldown, unknown, active]).toEqual([ok, ok, ok]);
    expect(ctx.sendVerificationCode).toHaveBeenCalledTimes(1);
    expect(hasher.hash).toHaveBeenCalledTimes(1);
  });

  it('el sexto envio en una hora no envia', async () => {
    const ctx = setup([{ ...ana }]);
    for (let i = 0; i < 6; i++) {
      await ctx.resend({ email: 'ana@x.com' });
      await flush();
      ctx.advance(61_000);
    }
    expect(ctx.sendVerificationCode).toHaveBeenCalledTimes(5);
  });
});

describe('login segun estado', () => {
  const build = (status: U['status']) => setup([{ ...ana, status }]);

  it('contrasena correcta: ACTIVE entra, INACTIVE 403 EMAIL_NOT_VERIFIED, BLOCKED 403 ACCOUNT_BLOCKED', async () => {
    const creds = { email: 'ana@x.com', password: 'clave-larga' };
    await expect(build('ACTIVE').login(creds)).resolves.toMatchObject({ data: { token: 'jwt' } });
    await expect(build('INACTIVE').login(creds)).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED', httpStatus: 403 });
    await expect(build('BLOCKED').login(creds)).rejects.toMatchObject({ code: 'ACCOUNT_BLOCKED', httpStatus: 403 });
  });

  it('contrasena incorrecta: INVALID_CREDENTIALS sea cual sea el estado', async () => {
    for (const status of ['ACTIVE', 'INACTIVE', 'BLOCKED'] as const) {
      await expect(build(status).login({ email: 'ana@x.com', password: 'mala' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
  });
});

describe('forgot-password segun estado', () => {
  it('ACTIVE e INACTIVE reciben codigo; BLOCKED no; la respuesta es la misma', async () => {
    const active = setup([{ ...ana, status: 'ACTIVE' }]);
    const inactive = setup([{ ...ana, status: 'INACTIVE' }]);
    const blocked = setup([{ ...ana, status: 'BLOCKED' }]);
    const a = await active.forgot({ email: 'ana@x.com' });
    const i = await inactive.forgot({ email: 'ana@x.com' });
    const b = await blocked.forgot({ email: 'ana@x.com' });
    await flush();
    expect(i).toEqual(a);
    expect(b).toEqual(a);
    expect(active.sendPasswordResetCode).toHaveBeenCalledTimes(1);
    expect(inactive.sendPasswordResetCode).toHaveBeenCalledTimes(1);
    expect(blocked.sendPasswordResetCode).not.toHaveBeenCalled();
  });
});

describe('verify-email exige la contrasena', () => {
  it('codigo correcto y contrasena incorrecta: INVALID_CODE, no activa y cuenta el intento', async () => {
    const ctx = setup();
    await ctx.register(input);
    hasher.compare.mockClear();
    await expect(ctx.verify({ email: 'ana@x.com', code: codeOf(ctx), password: 'otra-clave' })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
    expect(hasher.compare).toHaveBeenCalledTimes(2);
    expect(ctx.db.get('ana@x.com')!.status).toBe('INACTIVE');
    expect(ctx.tokens[0].attempts).toBe(1);
    await expect(ctx.verify({ email: 'ana@x.com', code: codeOf(ctx), password: 'clave-larga' })).resolves.toMatchObject({ success: true });
    expect(ctx.db.get('ana@x.com')!.status).toBe('ACTIVE');
  });

  it('cuenta BLOCKED: INVALID_CODE y sigue BLOCKED', async () => {
    const ctx = setup([{ ...ana, status: 'BLOCKED' }]);
    await expect(ctx.verify({ email: 'ana@x.com', code: '123456', password: 'clave-larga' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(ctx.db.get('ana@x.com')!.status).toBe('BLOCKED');
  });
});

describe('pre-account hijacking', () => {
  it('atacante registra con P; la victima recupera y activa con su contrasena; P ya no sirve', async () => {
    const ctx = setup();
    await ctx.register({ name: 'Ana', email: 'ana@x.com', password: 'clave-atacante' });
    const verificationCode = codeOf(ctx);
    ctx.advance(61_000);
    await ctx.forgot({ email: 'ana@x.com' });
    await flush();
    expect(ctx.sendPasswordResetCode).toHaveBeenCalledTimes(1);
    const resetCode = ctx.sendPasswordResetCode.mock.calls[0][0].code as string;
    await expect(ctx.reset({ email: 'ana@x.com', code: resetCode, newPassword: 'clave-victima' })).resolves.toMatchObject({ success: true });

    const user = ctx.db.get('ana@x.com')!;
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.password).toBe('h:clave-victima');
    expect(ctx.tokens.filter((t) => t.tokenType === 'EMAIL_VERIFICATION').every((t) => t.revokedAt || t.usedAt)).toBe(true);
    await expect(ctx.login({ email: 'ana@x.com', password: 'clave-atacante' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(ctx.login({ email: 'ana@x.com', password: 'clave-victima' })).resolves.toMatchObject({ data: { token: 'jwt' } });
    await expect(ctx.verify({ email: 'ana@x.com', code: verificationCode, password: 'clave-victima' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });
});

describe('google_login segun estado', () => {
  it('existente INACTIVE: EMAIL_NOT_VERIFIED; BLOCKED: ACCOUNT_BLOCKED', async () => {
    await expect(setup([{ ...ana, status: 'INACTIVE' }]).googleLogin({ email: 'Ana@x.com', name: 'Ana' })).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED', httpStatus: 403 });
    await expect(setup([{ ...ana, status: 'BLOCKED' }]).googleLogin({ email: 'ana@x.com', name: 'Ana' })).rejects.toMatchObject({ code: 'ACCOUNT_BLOCKED', httpStatus: 403 });
  });

  it('cuenta nueva: se crea ACTIVE con emailVerifiedAt', async () => {
    const ctx = setup();
    await expect(ctx.googleLogin({ email: 'nueva@x.com', name: 'Nueva' })).resolves.toMatchObject({ data: { token: 'jwt' } });
    expect(ctx.db.get('nueva@x.com')).toMatchObject({ status: 'ACTIVE' });
    expect(ctx.db.get('nueva@x.com')!.emailVerifiedAt).toBeInstanceOf(Date);
  });
});

describe('HTTP: rutas y codigos', () => {
  const res = () => {
    const r = { statusCode: 0, body: undefined as unknown, status: (c: number) => ((r.statusCode = c), r), json: (b: unknown) => ((r.body = b), r) };
    return r;
  };
  const verifyEmail = vi.fn().mockResolvedValue({ success: true, message: 'ok' });
  const resendVerification = vi.fn().mockResolvedValue({ success: true, message: 'ok' });
  const login = vi.fn();
  const service = { verifyEmail, resendVerification, login } as never;
  const c = makeAuthController(service);

  it('registra POST /verify-email y /resend-verification', () => {
    const layers = (makeAuthRoutes(service) as unknown as { stack: { route: { path: string; methods: Record<string, boolean> } }[] }).stack;
    for (const path of ['/verify-email', '/resend-verification']) {
      expect(layers.find((l) => l.route.path === path)?.route.methods.post).toBe(true);
    }
  });

  it('verify-email y resend-verification: 200; body invalido: 400 INVALID_BODY', async () => {
    const ok = res();
    await c.verifyEmail({ body: { email: ' A@X.com ', code: '123456', password: 'clave' } } as never, ok as never, vi.fn());
    expect(ok.statusCode).toBe(200);
    expect(verifyEmail).toHaveBeenCalledWith({ email: 'a@x.com', code: '123456', password: 'clave' });
    const bad = res();
    await c.verifyEmail({ body: { email: 'a@x.com', code: '12', password: 'clave' } } as never, bad as never, vi.fn());
    expect(bad.statusCode).toBe(400);
    expect(bad.body).toMatchObject({ code: 'INVALID_BODY' });
    const noPass = res();
    await c.verifyEmail({ body: { email: 'a@x.com', code: '123456' } } as never, noPass as never, vi.fn());
    expect(noPass.statusCode).toBe(400);
    const rs = res();
    await c.resendVerification({ body: { email: 'a@x.com' } } as never, rs as never, vi.fn());
    expect(rs.statusCode).toBe(200);
  });

  it('login: EMAIL_NOT_VERIFIED y ACCOUNT_BLOCKED -> 403 con code', async () => {
    for (const code of ['EMAIL_NOT_VERIFIED', 'ACCOUNT_BLOCKED']) {
      login.mockRejectedValueOnce(new AuthError('m', code, 403));
      const r = res();
      await c.login({ body: { email: 'a@x.com', password: 'x' } } as never, r as never, vi.fn());
      expect(r.statusCode).toBe(403);
      expect(r.body).toMatchObject({ success: false, code });
    }
  });
});

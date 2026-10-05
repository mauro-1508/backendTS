import { beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const SECRET = 'secreto-de-pruebas-del-nucleo-con-32-caracteres';

type TokenProviderT = typeof import('../../../src/shared/security/jwt').jwtTokenProvider;
let jwtTokenProvider: TokenProviderT;

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  ({ jwtTokenProvider } = await import('../../../src/shared/security/jwt'));
});

const buildLogin = async (roles: string[]) => {
  const { makeLogin } = await import('../../../src/domains/auth/application/login');
  return makeLogin({
    userRepository: { findByEmail: async () => ({ userId: 9, name: 'Ana', email: 'ana@x.com', password: 'h', status: 'ACTIVE' }) } as never,
    passwordHasher: { hash: async () => 'x', compare: async () => true },
    tokenProvider: jwtTokenProvider,
    roleReader: { listRoleNames: vi.fn().mockResolvedValue(roles) },
  });
};

const tokenOf = async (roles: string[]) => {
  const login = await buildLogin(roles);
  const result = await login({ email: 'ana@x.com', password: 'clave' });
  return (result.data as { token: string }).token;
};

describe('JWT del nucleo con roles', () => {
  it('el token de un ADMIN lleva roles ["ADMIN","USER"], sub y user_id', async () => {
    const decoded = jwt.verify(await tokenOf(['ADMIN', 'USER']), SECRET) as jwt.JwtPayload;
    expect(decoded.roles).toEqual(['ADMIN', 'USER']);
    expect(decoded.sub).toBe('9');
    expect(decoded.user_id).toBe(9);
    expect(decoded.email).toBe('ana@x.com');
  });

  it('el token de un USER lleva roles ["USER"]', async () => {
    const decoded = jwt.verify(await tokenOf(['USER']), SECRET) as jwt.JwtPayload;
    expect(decoded.roles).toEqual(['USER']);
  });

  it('caduca en 1 dia', async () => {
    const decoded = jwt.verify(await tokenOf(['USER']), SECRET) as jwt.JwtPayload;
    expect(decoded.exp! - decoded.iat!).toBe(86400);
  });

  it('verify sigue devolviendo userId y email (authMiddleware igual)', async () => {
    expect(jwtTokenProvider.verify(await tokenOf(['USER']))).toEqual({ userId: 9, email: 'ana@x.com' });
  });
});

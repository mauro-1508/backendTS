import { describe, expect, it, vi } from 'vitest';
import { makeRegister } from '../../../src/domains/auth/application/register';
import { makeGoogleLogin } from '../../../src/domains/auth/application/google_login';
import { RegistrationFailedError } from '../../../src/domains/auth/domain/service';

// Emision y envio del codigo de verificacion: aqui solo hay que dejarlos pasar.
const verificationDeps = {
  authRepository: { issueTokenIfAllowed: async () => 'issued' } as never,
  mailer: { sendVerificationCode: async () => undefined, sendPasswordResetCode: async () => undefined },
};

describe('register asigna rol por defecto', () => {
  it('llama a roleAssigner con el id del usuario creado', async () => {
    const assignDefaultRole = vi.fn().mockResolvedValue(undefined);
    const register = makeRegister({
      userRepository: {
        findByEmail: async () => null,
        create: async (u: { name: string; email: string }) => ({ userId: 42, name: u.name, email: u.email }),
      } as never,
      passwordHasher: { hash: async () => 'hashed', compare: async () => true } as never,
      roleAssigner: { assignDefaultRole },
      ...verificationDeps,
    });

    const result = await register({ name: 'Ana Perez', email: 'ana@example.com', password: 'Abcdef1!x' });

    expect(result.success).toBe(true);
    expect(assignDefaultRole).toHaveBeenCalledWith(42);
  });
});

describe('registro atomico por compensacion', () => {
  const setup = (assignDefaultRole: () => Promise<void>) => {
    const deleteById = vi.fn().mockResolvedValue(undefined);
    const register = makeRegister({
      userRepository: {
        findByEmail: async () => null,
        create: async (u: { name: string; email: string }) => ({ userId: 42, name: u.name, email: u.email }),
        deleteById,
      } as never,
      passwordHasher: { hash: async () => 'hashed', compare: async () => true } as never,
      roleAssigner: { assignDefaultRole },
      ...verificationDeps,
    });
    return { register, deleteById };
  };

  it('si assignDefaultRole falla borra el usuario y lanza error generico', async () => {
    const { register, deleteById } = setup(async () => {
      throw new Error('pg: relation "roles" secret detail');
    });
    const error = await register({ name: 'Ana Perez', email: 'ana@example.com', password: 'Abcdef1!x' }).catch((e) => e);
    expect(error).toBeInstanceOf(RegistrationFailedError);
    expect(error.message).not.toContain('pg');
    expect(deleteById).toHaveBeenCalledWith(42);
  });
});

describe('google_login asigna rol a cuentas nuevas', () => {
  const build = (assignDefaultRole: () => Promise<void>, existing: boolean) => {
    const deleteById = vi.fn().mockResolvedValue(undefined);
    const googleLogin = makeGoogleLogin({
      userRepository: {
        findByEmail: async () => (existing ? { userId: 5, email: 'a@b.com', status: 'ACTIVE' } : null),
        create: async (u: { name: string; email: string }) => ({ userId: 42, name: u.name, email: u.email }),
        deleteById,
      } as never,
      tokenProvider: { sign: () => 'tok' } as never,
      roleAssigner: { assignDefaultRole },
    });
    return { googleLogin, deleteById };
  };

  it('cuenta nueva: asigna rol y devuelve token', async () => {
    const assign = vi.fn().mockResolvedValue(undefined);
    const { googleLogin } = build(assign, false);
    const result = await googleLogin({ email: 'a@b.com', name: 'Ana' });
    expect(assign).toHaveBeenCalledWith(42);
    expect(result.data).toEqual({ token: 'tok' });
  });

  it('cuenta existente: no asigna rol', async () => {
    const assign = vi.fn();
    await build(assign, true).googleLogin({ email: 'a@b.com', name: 'Ana' });
    expect(assign).not.toHaveBeenCalled();
  });

  it('si falla la asignacion compensa borrando el usuario', async () => {
    const { googleLogin, deleteById } = build(async () => {
      throw new Error('boom');
    }, false);
    await expect(googleLogin({ email: 'a@b.com', name: 'Ana' })).rejects.toThrow(RegistrationFailedError);
    expect(deleteById).toHaveBeenCalledWith(42);
  });
});

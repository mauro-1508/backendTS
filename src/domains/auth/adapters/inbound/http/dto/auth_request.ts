import { z } from 'zod';

// Solo valida el tipo (string); las reglas de negocio siguen en el dominio.
const str = z.string();

export const registerBodySchema = z.object({ name: str, email: str, password: str });
export const loginBodySchema = z.object({ email: str, password: str });
export const forgotPasswordBodySchema = z.object({ email: str });
export const verifyCodeBodySchema = z.object({ email: str, code: str });
export const resetPasswordBodySchema = z.object({ email: str, code: str, newPassword: str });

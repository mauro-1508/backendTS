import { z } from 'zod';

// Forma y tamano de los datos; las reglas de negocio siguen en el dominio.
// bcrypt ignora lo que pasa de 72 bytes: se rechaza en vez de truncar en silencio.
const str = z.string().refine((v) => Buffer.byteLength(v, 'utf8') <= 72);
const email = z.string().trim().toLowerCase().email().max(255);
const code = z.string().regex(/^\d{6}$/);

export const registerBodySchema = z.object({ name: z.string().trim().min(1).max(120), email, password: str });
export const loginBodySchema = z.object({ email, password: str });
export const forgotPasswordBodySchema = z.object({ email });
export const verifyCodeBodySchema = z.object({ email, code });
export const verifyEmailBodySchema = z.object({ email, code, password: str });
export const resendVerificationBodySchema = z.object({ email });
export const resetPasswordBodySchema = z.object({ email, code, newPassword: str });

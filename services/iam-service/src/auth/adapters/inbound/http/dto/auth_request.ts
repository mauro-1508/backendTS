import { z } from 'zod';

// Forma y tamano de los datos; las reglas de negocio siguen en el dominio.
// bcrypt ignora lo que pasa de 72 bytes: se rechaza en vez de truncar en silencio.
const str = z.string().refine((v) => Buffer.byteLength(v, 'utf8') <= 72);
const email = z.string().trim().toLowerCase().email().max(255);
const code = z.string().regex(/^\d{6}$/);

// Sin consentimiento expreso no hay registro (Ley 1581); termsVersion cabe en users.terms_version.
export const registerBodySchema = z.object({
  name: z.string().trim().min(1).max(120), email, password: str,
  acceptedTerms: z.literal(true), termsVersion: z.string().trim().min(1).max(20),
});
export const loginBodySchema = z.object({ email, password: str });
export const forgotPasswordBodySchema = z.object({ email });
export const verifyCodeBodySchema = z.object({ email, code });
export const verifyEmailBodySchema = z.object({ email, code, password: str });
export const resendVerificationBodySchema = z.object({ email });
export const resetPasswordBodySchema = z.object({ email, code, newPassword: str });
// Un ID token de Google ronda 1-2 KB; el tope evita cuerpos enormes.
export const googleLoginBodySchema = z.object({ idToken: z.string().min(1).max(8192) });
// Un access token de Facebook ronda 200-300 caracteres.
export const facebookLoginBodySchema = z.object({ accessToken: z.string().min(1).max(2048) });

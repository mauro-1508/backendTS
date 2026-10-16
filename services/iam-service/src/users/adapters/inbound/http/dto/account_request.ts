import { z } from 'zod';

// Solo forma y tamano; las reglas de la contraseña nueva viven en el dominio.
const password = z.string().min(1).max(256);

export const changePasswordBodySchema = z.object({ currentPassword: password, newPassword: z.string().max(256) });
// password para cuentas con contraseña; code (6 digitos, enviado al correo) para cuentas creadas con Google.
export const deleteAccountBodySchema = z
  .object({ password: password.optional(), code: z.string().regex(/^\d{6}$/).optional() })
  .refine((body) => body.password !== undefined || body.code !== undefined);

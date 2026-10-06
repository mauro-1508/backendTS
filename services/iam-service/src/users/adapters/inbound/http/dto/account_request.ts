import { z } from 'zod';

// Solo forma y tamano; las reglas de la contraseña nueva viven en el dominio.
const password = z.string().min(1).max(256);

export const changePasswordBodySchema = z.object({ currentPassword: password, newPassword: z.string().max(256) });
export const deleteAccountBodySchema = z.object({ password });

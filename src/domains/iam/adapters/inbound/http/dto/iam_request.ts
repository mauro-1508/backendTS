import { z } from 'zod';

const id = z.coerce.number().int().positive().max(2147483647);
const roleName = z.string().trim().min(1).max(50);

export const userParamsSchema = z.object({ userId: id });
export const userRoleParamsSchema = z.object({ userId: id, roleName });
export const roleParamsSchema = z.object({ roleId: id });
export const assignRoleBodySchema = z.object({ roleName });

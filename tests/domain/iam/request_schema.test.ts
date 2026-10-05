import { describe, expect, it } from 'vitest';
import { roleParamsSchema, userParamsSchema, userRoleParamsSchema } from '../../../src/domains/iam/adapters/inbound/http/dto/iam_request';

describe('esquemas zod de iam', () => {
  it('acepta ids validos y coacciona strings numericos', () => {
    expect(userParamsSchema.parse({ userId: '7' })).toEqual({ userId: 7 });
    expect(userParamsSchema.parse({ userId: '2147483647' }).userId).toBe(2147483647);
  });

  it.each(['-1', '0', 'abc', '1.5', '2147483648'])('rechaza id %s', (value) => {
    expect(userParamsSchema.safeParse({ userId: value }).success).toBe(false);
    expect(roleParamsSchema.safeParse({ roleId: value }).success).toBe(false);
    expect(userRoleParamsSchema.safeParse({ userId: value, roleName: 'ADMIN' }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { translateAssignRoleFkError } from '../../../src/domains/iam/adapters/outbound/postgres/iam_fk_error';
import { RoleNotFoundError, UserNotFoundError } from '../../../src/domains/iam/domain/service';

describe('translateAssignRoleFkError', () => {
  it('fk de rol -> RoleNotFoundError', () => {
    expect(translateAssignRoleFkError({ code: '23503', constraint: 'fk_user_roles_role' })).toBeInstanceOf(RoleNotFoundError);
  });
  it('fk de usuario -> UserNotFoundError', () => {
    expect(translateAssignRoleFkError({ code: '23503', constraint: 'fk_user_roles_user' })).toBeInstanceOf(UserNotFoundError);
  });
  it('constraint desconocida u otro codigo -> null', () => {
    expect(translateAssignRoleFkError({ code: '23503', constraint: 'otra' })).toBeNull();
    expect(translateAssignRoleFkError({ code: '23505', constraint: 'fk_user_roles_role' })).toBeNull();
    expect(translateAssignRoleFkError(undefined)).toBeNull();
  });
});

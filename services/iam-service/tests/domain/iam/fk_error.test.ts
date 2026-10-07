import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { translateAssignRoleFkError } from '../../../src/iam/adapters/outbound/postgres/iam_fk_error';
import { RoleNotFoundError, UserNotFoundError } from '../../../src/iam/domain/service';

describe('translateAssignRoleFkError', () => {
  test('fk de rol -> RoleNotFoundError', () => {
    assert.ok(translateAssignRoleFkError({ code: '23503', constraint: 'fk_user_roles_role' }) instanceof RoleNotFoundError);
  });
  test('fk de usuario -> UserNotFoundError', () => {
    assert.ok(translateAssignRoleFkError({ code: '23503', constraint: 'fk_user_roles_user' }) instanceof UserNotFoundError);
  });
  test('constraint desconocida u otro codigo -> null', () => {
    assert.equal(translateAssignRoleFkError({ code: '23503', constraint: 'otra' }), null);
    assert.equal(translateAssignRoleFkError({ code: '23505', constraint: 'fk_user_roles_role' }), null);
    assert.equal(translateAssignRoleFkError(undefined), null);
  });
});

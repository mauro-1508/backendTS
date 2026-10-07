import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { iamDomainService as svc, PermissionDeniedError, RoleInUseError } from '../../../src/iam/domain/service';
import { Role } from '../../../src/iam/domain/entity';

const role = (permissions: string[]): Role => ({ roleId: 1, name: 'R', description: null, permissions });

describe('iamDomainService', () => {
  test('effectivePermissions une roles sin duplicados', () => {
    const user = role(['a', 'b']);
    const linguist = role(['a', 'b', 'c']);
    assert.deepEqual(svc.effectivePermissions([user, linguist]).sort(), ['a', 'b', 'c']);
  });

  test('ensureCanDelete lanza si el rol esta en uso (INV-017)', () => {
    assert.throws(() => svc.ensureCanDelete(1), RoleInUseError);
    assert.doesNotThrow(() => svc.ensureCanDelete(0));
  });

  test('ensureHasPermission lanza si falta el permiso', () => {
    assert.throws(() => svc.ensureHasPermission(['a'], 'b'), PermissionDeniedError);
    assert.doesNotThrow(() => svc.ensureHasPermission(['a'], 'a'));
  });
});

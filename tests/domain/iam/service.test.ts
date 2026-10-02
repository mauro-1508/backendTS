import { describe, expect, it } from 'vitest';
import { iamDomainService as svc, PermissionDeniedError, RoleInUseError } from '../../../src/domains/iam/domain/service';
import { Role } from '../../../src/domains/iam/domain/entity';

const role = (permissions: string[]): Role => ({ roleId: 1, name: 'R', description: null, permissions });

describe('iamDomainService', () => {
  it('effectivePermissions une roles sin duplicados', () => {
    const user = role(['a', 'b']);
    const linguist = role(['a', 'b', 'c']);
    expect(svc.effectivePermissions([user, linguist]).sort()).toEqual(['a', 'b', 'c']);
  });

  it('ensureCanDelete lanza si el rol esta en uso (INV-017)', () => {
    expect(() => svc.ensureCanDelete(1)).toThrow(RoleInUseError);
    expect(() => svc.ensureCanDelete(0)).not.toThrow();
  });

  it('ensureHasPermission lanza si falta el permiso', () => {
    expect(() => svc.ensureHasPermission(['a'], 'b')).toThrow(PermissionDeniedError);
    expect(() => svc.ensureHasPermission(['a'], 'a')).not.toThrow();
  });
});

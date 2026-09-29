import { beforeEach, describe, expect, it } from 'vitest';
import { makeFakeIamRepository } from './fake_iam_repository';
import { makeAssignRole } from '../../../src/domains/iam/application/assign_role';
import { makeRevokeRole } from '../../../src/domains/iam/application/revoke_role';
import { makeDeleteRole } from '../../../src/domains/iam/application/delete_role';
import { makeListRoles } from '../../../src/domains/iam/application/list_roles';
import { makeGetMyAccess } from '../../../src/domains/iam/application/get_my_access';
import { makeHasPermission } from '../../../src/domains/iam/application/has_permission';
import { makeAssignDefaultRole } from '../../../src/domains/iam/application/assign_default_role';
import {
  LastAdminError,
  PermissionDeniedError,
  ProtectedRoleError,
  RoleInUseError,
  RoleNotFoundError,
  UserNotFoundError,
  UserWithoutRoleError,
} from '../../../src/domains/iam/domain/service';

const ADMIN = 10;
const TARGET = 11;

describe('casos de uso iam', () => {
  let fake: ReturnType<typeof makeFakeIamRepository>;
  let deps: { iamRepository: typeof fake.repo };

  beforeEach(async () => {
    fake = makeFakeIamRepository();
    deps = { iamRepository: fake.repo };
    await fake.repo.assignRole({ userId: ADMIN, roleId: 3 });
  });

  it('asignar LINGUIST concede sus permisos', async () => {
    await makeAssignRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'LINGUIST' });
    expect(await makeHasPermission(deps)(TARGET, 'samples.validate')).toBe(true);
    expect(await makeHasPermission(deps)(TARGET, 'users.manage')).toBe(false);
    const access = await makeGetMyAccess(deps)({ userId: TARGET });
    expect((access.data as { roles: string[] }).roles).toEqual(['LINGUIST']);
  });

  it('actor sin users.manage recibe PermissionDeniedError', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 1 });
    const actor = { actorId: TARGET };
    await expect(makeListRoles(deps)(actor)).rejects.toThrow(PermissionDeniedError);
    await expect(makeAssignRole(deps)({ ...actor, userId: 12, roleName: 'ADMIN' })).rejects.toThrow(PermissionDeniedError);
    await expect(makeRevokeRole(deps)({ ...actor, userId: 12, roleName: 'USER' })).rejects.toThrow(PermissionDeniedError);
    await expect(makeDeleteRole(deps)({ ...actor, roleId: 4 })).rejects.toThrow(PermissionDeniedError);
  });

  it('borrar un rol en uso lanza RoleInUseError y uno libre se elimina', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 4 });
    await expect(makeDeleteRole(deps)({ actorId: ADMIN, roleId: 4 })).rejects.toThrow(RoleInUseError);
    fake.userRoles.clear();
    await fake.repo.assignRole({ userId: ADMIN, roleId: 3 });
    await makeDeleteRole(deps)({ actorId: ADMIN, roleId: 4 });
    expect(fake.roles.some((r) => r.roleId === 4)).toBe(false);
  });

  it('rol inexistente lanza RoleNotFoundError', async () => {
    await expect(makeAssignRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'NOPE' })).rejects.toThrow(RoleNotFoundError);
  });

  it('revocar quita el rol', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 1 });
    await makeAssignRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'LINGUIST' });
    await makeRevokeRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'LINGUIST' });
    expect(await makeHasPermission(deps)(TARGET, 'samples.validate')).toBe(false);
  });

  it('assignDefaultRole es idempotente', async () => {
    const assign = makeAssignDefaultRole(deps);
    await assign(TARGET);
    await assign(TARGET);
    const roles = await fake.repo.listRolesForUser(TARGET);
    expect(roles.map((r) => r.name)).toEqual(['USER']);
  });

  it('no se puede revocar al ultimo ADMIN, pero si hay otro si', async () => {
    await fake.repo.assignRole({ userId: ADMIN, roleId: 1 });
    await expect(makeRevokeRole(deps)({ actorId: ADMIN, userId: ADMIN, roleName: 'ADMIN' })).rejects.toThrow(LastAdminError);
    await fake.repo.assignRole({ userId: TARGET, roleId: 3 });
    await makeRevokeRole(deps)({ actorId: ADMIN, userId: ADMIN, roleName: 'ADMIN' });
    expect((await fake.repo.listRolesForUser(ADMIN)).map((r) => r.name)).toEqual(['USER']);
  });

  it('un usuario no puede quedar sin roles', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 1 });
    await expect(makeRevokeRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'USER' })).rejects.toThrow(UserWithoutRoleError);
    expect(await fake.repo.listRolesForUser(TARGET)).toHaveLength(1);
  });

  it('revocar un rol no asignado lanza RoleNotFoundError', async () => {
    await expect(makeRevokeRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'LINGUIST' })).rejects.toThrow(RoleNotFoundError);
  });

  it('asignar a un usuario inexistente lanza UserNotFoundError', async () => {
    await expect(makeAssignRole(deps)({ actorId: ADMIN, userId: 99, roleName: 'USER' })).rejects.toThrow(UserNotFoundError);
  });

  it('borrar un rol del seed lanza ProtectedRoleError', async () => {
    await expect(makeDeleteRole(deps)({ actorId: ADMIN, roleId: 1 })).rejects.toThrow(ProtectedRoleError);
    expect(fake.roles.some((r) => r.roleId === 1)).toBe(true);
  });

  it('listRoles y deleteRole con actor sin users.manage lanzan PermissionDeniedError (403)', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 2 });
    await expect(makeListRoles(deps)({ actorId: TARGET })).rejects.toThrow(PermissionDeniedError);
    await expect(makeDeleteRole(deps)({ actorId: TARGET, roleId: 4 })).rejects.toThrow(PermissionDeniedError);
  });
});

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeIamRepository } from './fake_iam_repository';
import { makeAssignRole } from '../../../src/iam/application/assign_role';
import { makeRevokeRole } from '../../../src/iam/application/revoke_role';
import { makeDeleteRole } from '../../../src/iam/application/delete_role';
import { makeListRoles } from '../../../src/iam/application/list_roles';
import { makeGetMyAccess } from '../../../src/iam/application/get_my_access';
import { makeHasPermission } from '../../../src/iam/application/has_permission';
import { makeAssignDefaultRole } from '../../../src/iam/application/assign_default_role';
import {
  LastAdminError,
  PermissionDeniedError,
  ProtectedRoleError,
  RoleInUseError,
  RoleNotFoundError,
  UserNotFoundError,
  UserWithoutRoleError,
} from '../../../src/iam/domain/service';

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

  test('asignar LINGUIST concede sus permisos', async () => {
    await makeAssignRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'LINGUIST' });
    assert.equal(await makeHasPermission(deps)(TARGET, 'samples.validate'), true);
    assert.equal(await makeHasPermission(deps)(TARGET, 'users.manage'), false);
    const access = await makeGetMyAccess(deps)({ userId: TARGET });
    assert.deepEqual((access.data as { roles: string[] }).roles, ['LINGUIST']);
  });

  test('getMyAccess devuelve roles y permisos efectivos (lo que iam firma en el JWT)', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 2 });
    const access = await makeGetMyAccess(deps)({ userId: TARGET });
    const data = access.data as { roles: string[]; permissions: string[] };
    assert.deepEqual(data.roles, ['LINGUIST']);
    assert.deepEqual([...data.permissions].sort(), ['lexicon.read', 'samples.validate', 'translation.create']);
  });

  test('actor sin users.manage recibe PermissionDeniedError', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 1 });
    const actor = { actorId: TARGET };
    await assert.rejects(makeListRoles(deps)(actor), PermissionDeniedError);
    await assert.rejects(makeAssignRole(deps)({ ...actor, userId: 12, roleName: 'ADMIN' }), PermissionDeniedError);
    await assert.rejects(makeRevokeRole(deps)({ ...actor, userId: 12, roleName: 'USER' }), PermissionDeniedError);
    await assert.rejects(makeDeleteRole(deps)({ ...actor, roleId: 4 }), PermissionDeniedError);
  });

  test('borrar un rol en uso lanza RoleInUseError y uno libre se elimina', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 4 });
    await assert.rejects(makeDeleteRole(deps)({ actorId: ADMIN, roleId: 4 }), RoleInUseError);
    fake.userRoles.clear();
    await fake.repo.assignRole({ userId: ADMIN, roleId: 3 });
    await makeDeleteRole(deps)({ actorId: ADMIN, roleId: 4 });
    assert.equal(fake.roles.some((r) => r.roleId === 4), false);
  });

  test('rol inexistente lanza RoleNotFoundError', async () => {
    await assert.rejects(makeAssignRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'NOPE' }), RoleNotFoundError);
  });

  test('revocar quita el rol', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 1 });
    await makeAssignRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'LINGUIST' });
    await makeRevokeRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'LINGUIST' });
    assert.equal(await makeHasPermission(deps)(TARGET, 'samples.validate'), false);
  });

  test('assignDefaultRole es idempotente', async () => {
    const assign = makeAssignDefaultRole(deps);
    await assign(TARGET);
    await assign(TARGET);
    const roles = await fake.repo.listRolesForUser(TARGET);
    assert.deepEqual(roles.map((r) => r.name), ['USER']);
  });

  test('no se puede revocar al ultimo ADMIN, pero si hay otro si', async () => {
    await fake.repo.assignRole({ userId: ADMIN, roleId: 1 });
    await assert.rejects(makeRevokeRole(deps)({ actorId: ADMIN, userId: ADMIN, roleName: 'ADMIN' }), LastAdminError);
    await fake.repo.assignRole({ userId: TARGET, roleId: 3 });
    await makeRevokeRole(deps)({ actorId: ADMIN, userId: ADMIN, roleName: 'ADMIN' });
    assert.deepEqual((await fake.repo.listRolesForUser(ADMIN)).map((r) => r.name), ['USER']);
  });

  test('un usuario no puede quedar sin roles', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 1 });
    await assert.rejects(makeRevokeRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'USER' }), UserWithoutRoleError);
    assert.equal((await fake.repo.listRolesForUser(TARGET)).length, 1);
  });

  test('revocar un rol no asignado lanza RoleNotFoundError', async () => {
    await assert.rejects(makeRevokeRole(deps)({ actorId: ADMIN, userId: TARGET, roleName: 'LINGUIST' }), RoleNotFoundError);
  });

  test('asignar a un usuario inexistente lanza UserNotFoundError', async () => {
    await assert.rejects(makeAssignRole(deps)({ actorId: ADMIN, userId: 99, roleName: 'USER' }), UserNotFoundError);
  });

  test('borrar un rol del seed lanza ProtectedRoleError', async () => {
    await assert.rejects(makeDeleteRole(deps)({ actorId: ADMIN, roleId: 1 }), ProtectedRoleError);
    assert.equal(fake.roles.some((r) => r.roleId === 1), true);
  });

  test('listRoles y deleteRole con actor sin users.manage lanzan PermissionDeniedError (403)', async () => {
    await fake.repo.assignRole({ userId: TARGET, roleId: 2 });
    await assert.rejects(makeListRoles(deps)({ actorId: TARGET }), PermissionDeniedError);
    await assert.rejects(makeDeleteRole(deps)({ actorId: TARGET, roleId: 4 }), PermissionDeniedError);
  });
});

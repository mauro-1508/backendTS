import { Role } from '../../../src/domains/iam/domain/entity';
import { iamDomainService } from '../../../src/domains/iam/domain/service';
import { IamRepository } from '../../../src/domains/iam/domain/repository';

export const USER_PERMS = ['translation.create', 'lexicon.read'];
export const LINGUIST_PERMS = [...USER_PERMS, 'samples.validate'];

export const makeFakeIamRepository = () => {
  const roles: Role[] = [
    { roleId: 1, name: 'USER', description: null, permissions: USER_PERMS },
    { roleId: 2, name: 'LINGUIST', description: null, permissions: LINGUIST_PERMS },
    { roleId: 3, name: 'ADMIN', description: null, permissions: [...LINGUIST_PERMS, 'users.manage'] },
    { roleId: 4, name: 'EMPTY', description: null, permissions: [] },
  ];
  const users = new Set([10, 11, 12]);
  const userRoles = new Set<string>(); // "userId:roleId"
  const key = (userId: number, roleId: number) => userId + ':' + roleId;
  const rolesOf = (userId: number) => roles.filter((r) => userRoles.has(key(userId, r.roleId)));

  const repo: IamRepository = {
    findRoleByName: async (name) => roles.find((r) => r.name === name) ?? null,
    findRoleById: async (id) => roles.find((r) => r.roleId === id) ?? null,
    listRoles: async () => roles,
    listRolesForUser: async (userId) => rolesOf(userId),
    listPermissionsForUser: async (userId) => [...new Set(rolesOf(userId).flatMap((r) => r.permissions))],
    userExists: async (userId) => users.has(userId),
    assignRole: async ({ userId, roleId }) => void userRoles.add(key(userId, roleId)),
    revokeRoleGuarded: async ({ userId, roleId, isAdminRole }) => {
      const outcome = iamDomainService.decideRevoke({
        hasRole: userRoles.has(key(userId, roleId)),
        isAdminRole,
        adminCount: [...userRoles].filter((k) => k.endsWith(':3')).length,
        userRoleCount: rolesOf(userId).length,
      });
      if (outcome === 'revoked') userRoles.delete(key(userId, roleId));
      return outcome;
    },
    countUsersWithRole: async (roleId) => [...userRoles].filter((k) => k.endsWith(':' + roleId)).length,
    deleteRole: async (roleId) => void roles.splice(roles.findIndex((r) => r.roleId === roleId), 1),
  };
  return { repo, userRoles, roles };
};

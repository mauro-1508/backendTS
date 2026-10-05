import { RequestHandler } from 'express';
import { postgresIamRepository } from './adapters/outbound/postgres/iam_repository';
import { makeHasPermission } from './application/has_permission';
import { makeGetMyAccess } from './application/get_my_access';
import { makeListRoles } from './application/list_roles';
import { makeAssignRole } from './application/assign_role';
import { makeRevokeRole } from './application/revoke_role';
import { makeDeleteRole } from './application/delete_role';
import { makeIsLastAdmin } from './application/is_last_admin';
import { makeAssignDefaultRole } from './application/assign_default_role';
import { makeIamRoutes } from './adapters/inbound/http/routes';
import { IamService } from './ports/inbound/iam_service';

export const makeIamModule = (deps: { authMiddleware: RequestHandler }) => {
  const repoDeps = { iamRepository: postgresIamRepository };
  const iamService: IamService = {
    hasPermission: makeHasPermission(repoDeps),
    getMyAccess: makeGetMyAccess(repoDeps),
    listRoles: makeListRoles(repoDeps),
    assignRole: makeAssignRole(repoDeps),
    revokeRole: makeRevokeRole(repoDeps),
    deleteRole: makeDeleteRole(repoDeps),
    assignDefaultRole: makeAssignDefaultRole(repoDeps),
    isLastAdmin: makeIsLastAdmin(repoDeps),
  };

  return { iamService, router: makeIamRoutes({ iamService, authMiddleware: deps.authMiddleware }) };
};

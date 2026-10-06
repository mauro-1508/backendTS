import { RequestHandler } from 'express';
import { IamRepository } from './ports/outbound/iam_repository';
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

export const makeIamModule = (deps: { iamRepository: IamRepository; authMiddleware: RequestHandler }) => {
  const iamService: IamService = {
    hasPermission: makeHasPermission(deps),
    getMyAccess: makeGetMyAccess(deps),
    listRoles: makeListRoles(deps),
    assignRole: makeAssignRole(deps),
    revokeRole: makeRevokeRole(deps),
    deleteRole: makeDeleteRole(deps),
    assignDefaultRole: makeAssignDefaultRole(deps),
    isLastAdmin: makeIsLastAdmin(deps),
  };

  return { iamService, router: makeIamRoutes({ iamService, authMiddleware: deps.authMiddleware }) };
};

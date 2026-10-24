import { RequestHandler } from 'express';
import { UserRepository } from './ports/outbound/user_repository';
import { AccountRepository } from './ports/outbound/account_repository';
import { UserStatsRepository } from './ports/outbound/user_stats_repository';
import { AdminDirectoryRepository } from './ports/outbound/admin_directory_repository';
import { PasswordHasher } from './ports/outbound/password_hasher';
import { PermissionChecker } from './ports/outbound/permission_checker';
import { AdminGuard } from './ports/outbound/admin_guard';
import { DeletionCodes } from './ports/outbound/deletion_codes';
import { makeGetUser } from './application/get_user';
import { makeChangePassword } from './application/change_password';
import { makeDeleteAccount } from './application/delete_account';
import { makeSendDeletionCode } from './application/send_deletion_code';
import { makeGetUserStats } from './application/get_user_stats';
import { makeListAdminIds } from './application/list_admin_ids';
import { makeUserRoutes } from './adapters/inbound/http/routes';
import { UserService } from './ports/inbound/user_service';

export interface UsersModuleDeps {
  userRepository: UserRepository;
  accountRepository: AccountRepository;
  userStatsRepository: UserStatsRepository;
  adminDirectory: AdminDirectoryRepository;
  passwordHasher: PasswordHasher;
  permissionChecker: PermissionChecker;
  adminGuard: AdminGuard;
  deletionCodes: DeletionCodes;
  authMiddleware: RequestHandler;
}

export const makeUsersModule = (deps: UsersModuleDeps) => {
  const userService: UserService = {
    getById: makeGetUser(deps),
    getStats: makeGetUserStats({ statsRepository: deps.userStatsRepository, permissionChecker: deps.permissionChecker }),
    listAdminIds: makeListAdminIds(deps),
    changePassword: makeChangePassword(deps),
    deleteAccount: makeDeleteAccount(deps),
    sendDeletionCode: makeSendDeletionCode(deps),
  };

  return { userService, router: makeUserRoutes({ userService, authMiddleware: deps.authMiddleware }) };
};

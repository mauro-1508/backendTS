import { AdminDirectoryRepository } from '../ports/outbound/admin_directory_repository';

export const makeListAdminIds = (deps: { adminDirectory: AdminDirectoryRepository }) =>
  (): Promise<number[]> => deps.adminDirectory.listActiveAdminIds();

/** Usuarios activos con rol ADMIN; profile los usa para saber a quien enviar los reportes. */
export interface AdminDirectoryRepository {
  listActiveAdminIds(): Promise<number[]>;
}

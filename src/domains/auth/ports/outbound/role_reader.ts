// Puerto para leer los nombres de rol de una cuenta (van en el JWT). Lo implementa
// un adaptador inyectado desde main.ts, de modo que auth no depende del dominio iam.
export interface RoleReader {
  listRoleNames(userId: number): Promise<string[]>;
}

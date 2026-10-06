// Puerto para leer roles y permisos efectivos de una cuenta (van en el JWT). Lo implementa
// un adaptador inyectado al componer la app, de modo que auth no depende del dominio iam.
export interface Access {
  roles: string[];
  permissions: string[];
}

export interface RoleReader {
  readAccess(userId: number): Promise<Access>;
}

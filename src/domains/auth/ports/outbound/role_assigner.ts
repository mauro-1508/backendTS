// Puerto para asignar el rol por defecto a una cuenta nueva. Lo implementa un
// adaptador inyectado desde main.ts, de modo que auth no depende del dominio iam.
export interface RoleAssigner {
  assignDefaultRole(userId: number): Promise<void>;
}

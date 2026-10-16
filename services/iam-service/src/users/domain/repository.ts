import { NewUser, User } from './entity';

export type EraseOutcome = 'erased' | 'last_admin' | 'not_found';

/** Operaciones de cuenta que deben ser atomicas (varias tablas en una transaccion). */
export interface AccountRepository {
  /** Guarda el hash nuevo y revoca los codigos de recuperacion pendientes, en una transaccion. */
  changePassword(userId: number, hashedPassword: string): Promise<void>;
  /**
   * Supresion (Ley 1581): borra de verdad tokens, roles y la fila de users, y deja iam.UserDeleted
   * en el outbox, todo en una transaccion (todo o nada). El resto de servicios limpia lo suyo al
   * consumir el evento. 'last_admin' si es el unico ADMIN (comprobado bajo bloqueo).
   */
  erase(userId: number): Promise<EraseOutcome>;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(userId: number): Promise<User | null>;
  create(user: NewUser): Promise<User>;
  /** Compensacion: elimina una cuenta recien creada si su alta no se pudo completar. */
  deleteById(userId: number): Promise<void>;
  updatePassword(userId: number, hashedPassword: string): Promise<void>;
}

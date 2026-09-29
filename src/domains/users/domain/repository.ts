import { NewUser, User } from './entity';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(userId: number): Promise<User | null>;
  create(user: NewUser): Promise<User>;
  /** Compensacion: elimina una cuenta recien creada si su alta no se pudo completar. */
  deleteById(userId: number): Promise<void>;
  updatePassword(userId: number, hashedPassword: string): Promise<void>;
}

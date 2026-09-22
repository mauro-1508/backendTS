import { NewUser, User } from './entity';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(userId: number): Promise<User | null>;
  create(user: NewUser): Promise<User>;
  updatePassword(userId: number, hashedPassword: string): Promise<void>;
}

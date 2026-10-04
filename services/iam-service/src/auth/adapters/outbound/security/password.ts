import bcrypt from 'bcrypt';
import { PasswordHasher } from '../../../ports/outbound/auth_provider';

const SALT_ROUNDS = 10;

export const bcryptPasswordHasher: PasswordHasher = {
  hash: (plain: string) => bcrypt.hash(plain, SALT_ROUNDS),
  compare: (plain: string, hashed: string) => bcrypt.compare(plain, hashed),
};

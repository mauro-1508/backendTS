import bcrypt from 'bcrypt';
import { PasswordHasher } from '../../../ports/outbound/password_hasher';

const SALT_ROUNDS = 10; // mismo coste que el registro

export const bcryptPasswordHasher: PasswordHasher = {
  hash: (plain) => bcrypt.hash(plain, SALT_ROUNDS),
  compare: (plain, hashed) => bcrypt.compare(plain, hashed),
};

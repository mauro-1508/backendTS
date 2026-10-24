import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PasswordHasher } from '../../../ports/outbound/auth_provider';

const SALT_ROUNDS = 10;

/**
 * Hash de una clave al azar, creado al arrancar: se compara cuando no hay hash
 * real para que "no existe" tarde lo mismo que "clave incorrecta". No vive en
 * el codigo para que no haya ningun hash publicado en el repositorio.
 */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), SALT_ROUNDS);

export const bcryptPasswordHasher: PasswordHasher = {
  hash: (plain: string) => bcrypt.hash(plain, SALT_ROUNDS),
  compare: async (plain: string, hashed: string | null) => {
    if (hashed) return bcrypt.compare(plain, hashed);
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  },
};

export type { TokenProvider } from '@traduce/shared';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  /**
   * `hashed` null = no hay hash (usuario o codigo inexistente): devuelve false
   * despues de gastar lo mismo que una comparacion real, para igualar tiempos.
   */
  compare(plain: string, hashed: string | null): Promise<boolean>;
}

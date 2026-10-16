/**
 * Codigos de un solo uso para confirmar el borrado de una cuenta sin contraseña (creada con Google).
 * users no sabe como se generan ni se guardan: lo implementa auth con su mecanismo de tokens.
 */
export interface DeletionCodes {
  /** Emite un codigo y lo envia al correo; respeta el enfriamiento y el tope por hora. */
  send(user: { userId: number; email: string; name: string }): Promise<'issued' | 'cooldown' | 'hourly_limit'>;
  /** True si coincide con el codigo vivo. Cada comprobacion gasta un intento (maximo 5). */
  check(userId: number, code: string): Promise<boolean>;
}

import { UserToken, UserTokenType } from './entity';
import { IssueDecision } from './service';

export interface AuthRepository {
  /**
   * En UNA transaccion con bloqueo por usuario: lee ultimo envio y envios de la ultima hora, aplica `decide`
   * (regla del dominio) y, solo si es 'ok', revoca los tokens vivos e inserta el nuevo.
   */
  issueTokenIfAllowed(params: {
    userId: number;
    type: UserTokenType;
    /** Se invoca solo si la decision es 'ok' (evita bcrypt innecesario), dentro de la transaccion. */
    hashToken: () => Promise<string>;
    expiresAt: Date;
    now: Date;
    decide: (lastCreatedAt: Date | null, sentLastHour: number) => IssueDecision;
  }): Promise<'issued' | 'cooldown' | 'hourly_limit'>;
  /**
   * Reserva de forma atomica un intento sobre el token vivo (no usado, no revocado, no caducado, con
   * menos de `maxAttempts` intentos) y lo devuelve; null si no hay ninguno.
   */
  reserveAttempt(userId: number, type: UserTokenType, now: Date, maxAttempts: number): Promise<UserToken | null>;
  /** Devuelve el intento reservado cuando el codigo era correcto (verify-code no consume el token). */
  releaseAttempt(tokenId: number): Promise<void>;
  /**
   * Consume el token vivo y cambia la contrasena en una transaccion; false si ya no estaba vivo. Si la cuenta
   * era INACTIVE la activa (email_verified_at) y revoca sus EMAIL_VERIFICATION vivos en la misma transaccion.
   */
  consumeAndResetPassword(tokenId: number, userId: number, passwordHash: string): Promise<boolean>;
  /** Consume el token vivo y activa la cuenta (INACTIVE -> ACTIVE, email_verified_at) en una transaccion; false si no. */
  consumeAndActivate(tokenId: number, userId: number): Promise<boolean>;
}

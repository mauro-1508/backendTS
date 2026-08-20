import { UserRepository } from '../../ports/outbound/user_repository';
import { AuthRepository } from '../../ports/outbound/auth_repository';
import { Mailer } from '../../ports/outbound/mailer';
import { authDomainService } from '../../domain/auth/service';
import { AuthResult } from '../../ports/inbound/auth_service';

export const makeForgotPassword = (deps: {
  userRepository: UserRepository;
  authRepository: AuthRepository;
  mailer: Mailer;
}) =>
  async ({ email }: { email: string }): Promise<AuthResult> => {
    if (!email) {
      throw new Error('El email es obligatorio');
    }

    const user = await deps.userRepository.findByEmail(email);

    // Respondemos igual aunque no exista, por seguridad.
    if (!user) {
      return { success: true, message: 'Si el correo existe, recibirás un código' };
    }

    const code = authDomainService.generateResetCode();
    const tokenHash = authDomainService.hashResetCode(code);
    const expiresAt = authDomainService.resetCodeExpiryDate();

    await deps.authRepository.createResetToken({ userId: user.userId, tokenHash, expiresAt });

    await deps.mailer.sendMail({
      to: user.email,
      subject: 'Código de recuperación - Signa',
      html: `
        <h2>Recuperar contraseña</h2>
        <p>Hola ${user.name}, tu código de verificación es:</p>
        <h1 style="letter-spacing:8px;color:#3B82F6;">${code}</h1>
        <p>Este código expira en <strong>15 minutos</strong>.</p>
        <p>Si no solicitaste esto, ignora este correo.</p>
      `,
    });

    return { success: true, message: 'Si el correo existe, recibirás un código' };
  };

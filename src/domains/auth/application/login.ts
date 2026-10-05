import { UserRepository } from '../../users/ports/outbound/user_repository';
import { normalizeEmail } from '../../users/domain/service';
import { PasswordHasher, TokenProvider } from '../ports/outbound/auth_provider';
import { AccountBlockedError, DUMMY_HASH, EmailNotVerifiedError, InvalidCredentialsError, ValidationError } from '../domain/service';
import { RoleReader } from '../ports/outbound/role_reader';
import { AuthResult, LoginInput } from '../ports/inbound/auth_service';

export const makeLogin = (deps: {
  userRepository: UserRepository;
  passwordHasher: PasswordHasher;
  tokenProvider: TokenProvider;
  roleReader: RoleReader;
}) =>
  async ({ email, password }: LoginInput): Promise<AuthResult> => {
    if (!email || !password) {
      throw new ValidationError('Email y contraseña son obligatorios');
    }

    const user = await deps.userRepository.findByEmail(normalizeEmail(email));
    // Siempre se ejecuta un bcrypt.compare (contra un hash falso si no hay cuenta o clave) para no filtrar por tiempo.
    const isPasswordValid = await deps.passwordHasher.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !user.password || !isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    // Solo tras acreditar la contrasena se revela el estado (antes seria enumeracion de cuentas).
    if (user.status === 'BLOCKED') throw new AccountBlockedError();
    if (user.status !== 'ACTIVE') throw new EmailNotVerifiedError();

    const roles = await deps.roleReader.listRoleNames(user.userId);
    const token = deps.tokenProvider.sign({ userId: user.userId, email: user.email, roles });

    return {
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        token,
        user: { user_id: user.userId, name: user.name, email: user.email },
      },
    };
  };

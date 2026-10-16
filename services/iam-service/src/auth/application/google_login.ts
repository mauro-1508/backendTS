import { GoogleTokenVerifier } from '../ports/outbound/google_token_verifier';
import { AuthResult, GoogleLoginInput } from '../ports/inbound/auth_service';
import { InvalidGoogleTokenError } from '../domain/service';
import { signInWithVerifiedEmail, SocialSignInDeps } from './social_sign_in';

export const makeGoogleLogin = (deps: SocialSignInDeps & { googleTokenVerifier: GoogleTokenVerifier }) =>
  async ({ idToken }: GoogleLoginInput): Promise<AuthResult> => {
    // Solo se usan datos del token verificado por Google, nunca los que mande el cliente.
    const identity = await deps.googleTokenVerifier.verify(idToken);
    if (!identity.emailVerified) throw new InvalidGoogleTokenError();
    return signInWithVerifiedEmail(deps, identity);
  };

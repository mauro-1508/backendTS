import { FacebookTokenVerifier } from '../ports/outbound/facebook_token_verifier';
import { AuthResult, FacebookLoginInput } from '../ports/inbound/auth_service';
import { FacebookEmailRequiredError } from '../domain/service';
import { signInWithVerifiedEmail, SocialSignInDeps } from './social_sign_in';

export const makeFacebookLogin = (deps: SocialSignInDeps & { facebookTokenVerifier: FacebookTokenVerifier }) =>
  async ({ accessToken, ...consent }: FacebookLoginInput): Promise<AuthResult> => {
    // Solo se usan datos que Facebook devuelve para un token emitido a esta app.
    const identity = await deps.facebookTokenVerifier.verify(accessToken);
    // Cuentas registradas solo con telefono (o que negaron el permiso email): sin correo no hay cuenta.
    if (!identity.email) throw new FacebookEmailRequiredError();
    return signInWithVerifiedEmail(deps, { email: identity.email, name: identity.name }, consent);
  };

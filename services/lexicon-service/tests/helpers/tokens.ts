import jwt from 'jsonwebtoken';

export const TEST_JWT_SECRET = 'secreto-de-pruebas-lexicon-con-32-caracteres';

/** Firma tokens como los emitiria iam; el servicio solo los verifica. */
export const signTestToken = (claims: Record<string, unknown>, secret: string = TEST_JWT_SECRET): string =>
  jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: '1h' });

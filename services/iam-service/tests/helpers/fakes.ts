import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventPublisher } from '@traduce/shared';

/** Publicador falso que guarda lo publicado. */
export class RecordingEventPublisher implements EventPublisher {
  published: Array<{ type: string; payload: unknown }> = [];
  async publish(type: string, payload: unknown) { this.published.push({ type, payload }); }
}

export const failingEventPublisher: EventPublisher = {
  publish: async () => { throw new Error('broker caido'); },
};

/** Respuesta Express falsa: status/json encadenables y espiables. */
export const fakeRes = () => {
  const res: any = {};
  res.status = mock.fn(() => res);
  res.json = mock.fn(() => res);
  return res;
};

/** Argumentos de la llamada n-esima (por defecto la ultima) de un mock.fn. */
export const argsOf = (fn: { mock: { calls: Array<{ arguments: any[] }> } }, index = -1): any[] =>
  fn.mock.calls.at(index)!.arguments;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof RegExp);

/** Equivalente a toMatchObject: `expected` solo lista las propiedades que importan. RegExp compara texto. */
export const assertMatch = (actual: unknown, expected: unknown, path = 'valor'): void => {
  if (expected instanceof RegExp) {
    assert.match(String(actual), expected, path);
  } else if (isPlainObject(expected)) {
    assert.ok(isPlainObject(actual) || Array.isArray(actual), `${path} deberia ser un objeto`);
    for (const key of Object.keys(expected)) assertMatch((actual as any)[key], expected[key], `${path}.${key}`);
  } else {
    assert.deepStrictEqual(actual, expected, path);
  }
};

/** Espera que la promesa se rechace con un error que cumpla `expected` (propiedades parciales). */
export const rejectsWith = async (promise: Promise<unknown>, expected: Record<string, unknown>): Promise<void> => {
  const error = await promise.then(() => assert.fail('se esperaba un rechazo'), (e: unknown) => e);
  assertMatch(error, expected);
};

/** Espera que la promesa se resuelva con un valor que cumpla `expected` (propiedades parciales). */
export const resolvesMatching = async (promise: Promise<unknown>, expected: Record<string, unknown>): Promise<void> => {
  assertMatch(await promise, expected);
};

export const flush = () => new Promise<void>(resolve => setImmediate(resolve));

/** Identidad que el verificador falso de Google devuelve para un token de prueba. */
export interface FakeGoogleIdentity {
  email: string;
  name?: string | null;
  emailVerified?: boolean;
}

/** "Token" de prueba: la identidad serializada. Solo lo entiende fakeGoogleTokenVerifier. */
export const googleIdToken = (identity: FakeGoogleIdentity): string => JSON.stringify(identity);

/** Sustituye a Google en los tests de casos de uso: devuelve la identidad codificada en el token. */
export const fakeGoogleTokenVerifier = {
  verify: async (idToken: string) => {
    const { email, name = null, emailVerified = true } = JSON.parse(idToken) as FakeGoogleIdentity;
    return { email, name, emailVerified };
  },
};

/** "Access token" de prueba para fakeFacebookTokenVerifier: la identidad serializada. */
export const facebookAccessToken = (identity: { email: string | null; name?: string | null }): string => JSON.stringify(identity);

/** Sustituye a la Graph API en los tests: devuelve la identidad codificada en el token. */
export const fakeFacebookTokenVerifier = {
  verify: async (accessToken: string) => {
    const { email, name = null } = JSON.parse(accessToken) as { email: string | null; name?: string | null };
    return { email, name };
  },
};

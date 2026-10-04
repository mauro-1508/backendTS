export const SERVICE_NAMES = ['iam', 'recognition', 'lexicon', 'analytics', 'profile'] as const;
export type ServiceName = typeof SERVICE_NAMES[number];

/** Prefijos publicos que atiende cada servicio (ver MICROSERVICES_PLAN.md). */
export const ROUTE_PREFIXES: Record<ServiceName, readonly string[]> = {
  iam: ['/api/auth', '/api/users'],
  recognition: ['/api/translations', '/api/recognition', '/api/sign-templates', '/api/samples'],
  lexicon: ['/api/lexicon'],
  analytics: ['/api/analytics'],
  profile: ['/api/profile', '/api/notifications', '/api/achievements'],
};

/** Rutas donde un token viejo o caducado no debe impedir iniciar sesion. */
export const PUBLIC_PREFIXES: readonly string[] = ['/api/auth'];

export const matchesPrefix = (path: string, prefix: string): boolean =>
  path === prefix || path.startsWith(`${prefix}/`);

export const matchesAnyPrefix = (path: string, prefixes: readonly string[]): boolean =>
  prefixes.some(prefix => matchesPrefix(path, prefix));

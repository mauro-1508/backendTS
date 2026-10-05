export type Env = Record<string, string | undefined>;

export interface DatabaseConfig {
  host: string | undefined;
  port: number;
  user: string | undefined;
  password: string | undefined;
  database: string | undefined;
}

export type RoleSource = 'jwt' | 'none';

export interface ServiceConfig {
  port: number;
  db: DatabaseConfig;
  jwtSecret: string;
  /** Vacio = eventos en memoria (sin RabbitMQ). */
  rabbitmqUrl: string;
  roleSource: RoleSource;
}

export const DEFAULT_PORT = 3003;
const DEFAULT_DB_PORT = 5432;
const DEFAULT_ROLE_SOURCE: RoleSource = 'none';
const ROLE_SOURCES: readonly RoleSource[] = ['jwt', 'none'];
export const MIN_JWT_SECRET_LENGTH = 32;

/** Aborta el arranque si el secreto falta o es demasiado corto para HS256. */
export const requireJwtSecret = (secret: string | undefined): string => {
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET es obligatorio y debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres`);
  }
  return secret;
};

const parseRoleSource = (value: string | undefined): RoleSource => {
  const source = (value ?? DEFAULT_ROLE_SOURCE) as RoleSource;
  if (!ROLE_SOURCES.includes(source)) {
    throw new Error(`ROLE_SOURCE debe ser uno de: ${ROLE_SOURCES.join(', ')} (recibido "${value}")`);
  }
  return source;
};

/**
 * Lector de variables de entorno: con prefijo, `<PREFIJO>_<NOMBRE>` gana sobre
 * `<NOMBRE>`. Es el unico lugar que toca `process.env`.
 */
export const makeEnvReader = (env: Env = process.env, prefix?: string) =>
  (name: string): string | undefined => {
    const prefixed = prefix ? env[`${prefix}_${name}`] : undefined;
    return prefixed || env[name] || undefined;
  };

export const loadServiceConfig = (env: Env = process.env): ServiceConfig => {
  const read = makeEnvReader(env);
  return {
    port: Number(read('PORT')) || DEFAULT_PORT,
    db: {
      host: read('DB_HOST'),
      port: Number(read('DB_PORT')) || DEFAULT_DB_PORT,
      user: read('DB_USER'),
      password: read('DB_PASSWORD'),
      database: read('DB_NAME'),
    },
    jwtSecret: requireJwtSecret(read('JWT_SECRET')),
    rabbitmqUrl: read('RABBITMQ_URL') ?? '',
    roleSource: parseRoleSource(read('ROLE_SOURCE')),
  };
};

export type Env = Record<string, string | undefined>;

export interface DatabaseConfig {
  host: string | undefined;
  port: number;
  user: string | undefined;
  password: string | undefined;
  database: string | undefined;
}

export interface ServiceConfig {
  port: number;
  db: DatabaseConfig;
  jwt: { secret: string; expiresIn: string };
  /** Vacio = eventos en memoria (sin RabbitMQ). */
  rabbitmqUrl: string;
  mongoUrl: string;
}

export interface LoadConfigOptions {
  /** Prefijo del servicio (p. ej. `LEXICON`): `LEXICON_DB_HOST` gana sobre `DB_HOST`. */
  prefix?: string;
  defaultPort: number;
  env?: Env;
}

const DEFAULT_DB_PORT = 5432;
const DEFAULT_JWT_EXPIRES_IN = '1d';
export const MIN_JWT_SECRET_LENGTH = 32;

/** Aborta el arranque si el secreto falta o es demasiado corto para HS256. */
export const requireJwtSecret = (secret: string | undefined): string => {
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET es obligatorio y debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres`);
  }
  return secret;
};

/**
 * Lector de variables de entorno: con prefijo, `<PREFIJO>_<NOMBRE>` gana sobre
 * `<NOMBRE>`. Es el unico lugar que toca `process.env`; los servicios leen sus
 * variables propias con este lector desde su config.
 */
export const makeEnvReader = (env: Env = process.env, prefix?: string) =>
  (name: string): string | undefined => {
    const prefixed = prefix ? env[`${prefix}_${name}`] : undefined;
    return prefixed || env[name] || undefined;
  };

export const loadConfig = (options: LoadConfigOptions): ServiceConfig => {
  const read = makeEnvReader(options.env, options.prefix);
  return {
    port: Number(read('PORT')) || options.defaultPort,
    db: {
      host: read('DB_HOST'),
      port: Number(read('DB_PORT')) || DEFAULT_DB_PORT,
      user: read('DB_USER'),
      password: read('DB_PASSWORD'),
      database: read('DB_NAME'),
    },
    jwt: {
      secret: requireJwtSecret(read('JWT_SECRET')),
      expiresIn: read('JWT_EXPIRES_IN') ?? DEFAULT_JWT_EXPIRES_IN,
    },
    rabbitmqUrl: read('RABBITMQ_URL') ?? '',
    mongoUrl: read('MONGO_URL') ?? '',
  };
};

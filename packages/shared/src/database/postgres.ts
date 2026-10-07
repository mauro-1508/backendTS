import { Pool } from 'pg';
import { DatabaseConfig } from '../config/load_config';

export const makePgPool = (db: DatabaseConfig): Pool =>
  new Pool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
  });

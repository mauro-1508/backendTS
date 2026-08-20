import { UserRepository } from '../../../ports/outbound/user_repository';
import { NewUser, User } from '../../../domain/user/entity';
import { pool } from './postgres';

interface UserRow {
  user_id: number;
  name: string;
  email: string;
  password: string | null;
  terms_accepted: boolean;
  terms_accepted_at: Date | null;
  created_at: Date;
}

const toUser = (row: UserRow): User => ({
  userId: row.user_id,
  name: row.name,
  email: row.email,
  password: row.password,
  termsAccepted: row.terms_accepted,
  termsAcceptedAt: row.terms_accepted_at,
  createdAt: row.created_at,
});

export const postgresUserRepository: UserRepository = {
  findByEmail: async (email: string) => {
    const { rows } = await pool.query<UserRow>(
      `SELECT user_id, name, email, password, terms_accepted, terms_accepted_at, created_at
       FROM public.users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );
    return rows[0] ? toUser(rows[0]) : null;
  },

  findById: async (userId: number) => {
    const { rows } = await pool.query<UserRow>(
      `SELECT user_id, name, email, password, terms_accepted, terms_accepted_at, created_at
       FROM public.users
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    return rows[0] ? toUser(rows[0]) : null;
  },

  create: async ({ name, email, password }: NewUser) => {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO public.users (name, email, password, terms_accepted, terms_accepted_at)
       VALUES ($1, $2, $3, true, NOW())
       RETURNING user_id, name, email, password, terms_accepted, terms_accepted_at, created_at`,
      [name, email, password]
    );
    return toUser(rows[0]);
  },

  updatePassword: async (userId: number, hashedPassword: string) => {
    await pool.query(`UPDATE public.users SET password = $1 WHERE user_id = $2`, [hashedPassword, userId]);
  },
};

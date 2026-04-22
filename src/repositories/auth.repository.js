const pool = require('../config/db');

const authRepository = {
  findUserByEmail: async (email) => {
    const query = `
      SELECT user_id, name, email, password
      FROM public.users
      WHERE email = $1
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [email]);
    return rows[0];
  },

  createUser: async ({ name, email, password }) => {
    const query = `
      INSERT INTO public.users (name, email, password, terms_accepted, terms_accepted_at)
      VALUES ($1, $2, $3, true, NOW())
      RETURNING user_id, name, email
    `;

    const values = [name, email, password];
    const { rows } = await pool.query(query, values);

    return rows[0];
  },
  createResetToken: async ({ userId, tokenHash, expiresAt }) => {
    const query = `
      INSERT INTO public.password_reset_token (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING token_id
    `;
    const { rows } = await pool.query(query, [userId, tokenHash, expiresAt]);
    return rows[0];
  },

  findResetToken: async (tokenHash) => {
    const query = `
      SELECT token_id, user_id, expires_at, used_at
      FROM public.password_reset_token
      WHERE token_hash = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [tokenHash]);
    return rows[0];
  },

  markTokenAsUsed: async (tokenId) => {
    const query = `
      UPDATE public.password_reset_token
      SET used_at = NOW()
      WHERE token_id = $1
    `;
    await pool.query(query, [tokenId]);
  },

  updatePassword: async ({ userId, hashedPassword }) => {
    const query = `
      UPDATE public.users
      SET password = $1
      WHERE user_id = $2
    `;
    await pool.query(query, [hashedPassword, userId]);
  },
};

module.exports = authRepository;
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
};

module.exports = authRepository;
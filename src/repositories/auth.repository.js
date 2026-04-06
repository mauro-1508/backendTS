const pool = require('../config/db');

const authRepository = {
  findUserByEmail: async (email) => {
    const query = `
      SELECT id, name, email, password
      FROM users
      WHERE email = $1
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [email]);
    return rows[0];
  },

  createUser: async ({ name, email, password }) => {
    const query = `
      INSERT INTO users (name, email, password, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id, name, email, created_at
    `;

    const values = [name, email, password];
    const { rows } = await pool.query(query, values);

    return rows[0];
  },
};

module.exports = authRepository;
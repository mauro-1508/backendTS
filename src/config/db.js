const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});


pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error DB:', err);
  } else {
    console.log('DB conectada');
  }
});

module.exports = pool;
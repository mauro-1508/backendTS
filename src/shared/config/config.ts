import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwt: {
    secret: process.env.JWT_SECRET as string,
    expiresIn: '1d',
  },
  mailer: {
    service: 'gmail',
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
};

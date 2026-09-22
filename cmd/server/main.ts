import express from 'express';
import cors from 'cors';
import { config } from '../../src/shared/config/config';
import { pool } from '../../src/shared/database/postgres';
import { jwtTokenProvider } from '../../src/shared/security/jwt';
import { makeAuthMiddleware } from '../../src/shared/http/auth_middleware';
import { errorHandler } from '../../src/shared/http/error_handler';
import { makeAuthModule } from '../../src/domains/auth/auth.module';
import { makeUsersModule } from '../../src/domains/users/users.module';
import { makeTranslationsModule } from '../../src/domains/translations/translations.module';

const authMiddleware = makeAuthMiddleware(jwtTokenProvider);

const app = express();

// El frontend web (Expo) corre en un puerto distinto al backend; sin CORS el
// navegador bloquea las peticiones.
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Cada dominio expone su router; aqui solo se montan.
app.use('/api/auth', makeAuthModule().router);
app.use('/api/translations', makeTranslationsModule({ authMiddleware }).router);
app.use('/api/users', makeUsersModule({ authMiddleware }).router);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Servidor corriendo en el puerto ${config.port}`);
});

process.on('SIGTERM', () => {
  void pool.end();
});

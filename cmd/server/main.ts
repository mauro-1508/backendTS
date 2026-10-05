import express from 'express';
import cors from 'cors';
import { config } from '../../src/shared/config/config';
import { pool } from '../../src/shared/database/postgres';
import { jwtTokenProvider } from '../../src/shared/security/jwt';
import { makeAuthMiddleware } from '../../src/shared/http/auth_middleware';
import { errorHandler } from '../../src/shared/http/error_handler';
import { makeIamModule } from '../../src/domains/iam/iam.module';
import { makeAuthModule } from '../../src/domains/auth/auth.module';
import { makeUsersModule } from '../../src/domains/users/users.module';
import { makeTranslationsModule } from '../../src/domains/translations/translations.module';
import { makeAnalyticsModule } from '../../src/domains/analytics/analytics.module';
import { makeIaModule } from '../../src/domains/ia/ia.module';

const authMiddleware = makeAuthMiddleware(jwtTokenProvider);

const app = express();

// El frontend web (Expo) corre en un puerto distinto al backend; sin CORS el
// navegador bloquea las peticiones.
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Cada dominio expone su router; aqui solo se montan.
const iam = makeIamModule({ authMiddleware });

// auth no conoce iam: recibe un adaptador que cumple su puerto RoleAssigner.
const roleAssigner = { assignDefaultRole: iam.iamService.assignDefaultRole };

// auth tampoco conoce iam para leer roles: van en el JWT.
const roleReader = {
  listRoleNames: async (userId: number): Promise<string[]> => {
    const result = await iam.iamService.getMyAccess({ userId });
    return (result.data as { roles: string[] }).roles;
  },
};

// analytics no conoce iam: recibe un adaptador que cumple su puerto PermissionChecker.
const permissionChecker = { hasPermission: iam.iamService.hasPermission };

app.use('/api/iam', iam.router);
app.use('/api/auth', makeAuthModule({ roleAssigner, roleReader }).router);
app.use('/api/translations', makeTranslationsModule({ authMiddleware, permissionChecker }).router);
app.use('/api/users', makeUsersModule({ authMiddleware, permissionChecker }).router);
app.use('/api/sign-templates', makeIaModule({ authMiddleware, permissionChecker }).router);
app.use('/api/analytics', makeAnalyticsModule({ authMiddleware, permissionChecker }).router);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Servidor corriendo en el puerto ${config.port}`);
});

process.on('SIGTERM', () => {
  void pool.end();
});

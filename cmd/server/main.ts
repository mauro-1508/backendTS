import express from 'express';
import cors from 'cors';
import { config } from '../../src/shared/config/config';
import { pool } from '../../src/shared/database/postgres';
import { jwtTokenProvider } from '../../src/shared/security/jwt';
import { makeAuthMiddleware } from '../../src/shared/http/auth_middleware';
import { makeRequireRole } from '../../src/shared/http/require_role';
import { postgresRoleChecker } from '../../src/shared/security/postgres_role_checker';
import { errorHandler } from '../../src/shared/http/error_handler';
import { makeIamModule } from '../../src/domains/iam/iam.module';
import { makeAuthModule } from '../../src/domains/auth/auth.module';
import { makeUsersModule } from '../../src/domains/users/users.module';
import { makeTranslationsModule } from '../../src/domains/translations/translations.module';
import { makeAnalyticsModule } from '../../src/domains/analytics/analytics.module';
import { makeIaModule } from '../../src/domains/ia/ia.module';
import { makeLexiconModule } from '../../src/domains/lexicon/lexicon.module';

const authMiddleware = makeAuthMiddleware(jwtTokenProvider);
const requireRole = makeRequireRole(postgresRoleChecker);

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

// users tampoco conoce iam para la baja de cuenta: pregunta si es el ultimo ADMIN por un puerto.
const adminGuard = { isLastAdmin: iam.iamService.isLastAdmin };

app.use('/api/iam', iam.router);
app.use('/api/auth', makeAuthModule({ roleAssigner }).router);
app.use('/api/translations', makeTranslationsModule({ authMiddleware }).router);
app.use('/api/users', makeUsersModule({ authMiddleware }).router);
app.use('/api/sign-templates', makeIaModule({ authMiddleware }).router);
app.use('/api/lexicon', makeLexiconModule({ authMiddleware, requireAdmin: requireRole('ADMIN') }).router);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Servidor corriendo en el puerto ${config.port}`);
});

process.on('SIGTERM', () => {
  void pool.end();
});

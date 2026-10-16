# Propuesta de commits separados

Comandos sugeridos; NO se ejecutaron. Ejecutarlos desde el worktree
/tmp/backendTS-profile-account-deletion, después de revisar cada diff.
El estado inicial estaba limpio y los directorios indicados contienen los
cambios de esta tarea. Revisar otra vez git status si hubo ediciones posteriores.
Ningún grupo incluye .vscode ni el checkout original.

## 1. Primitivas compartidas de entrega

Archivos: topología nueva, publicación, sobres, validador, reintentos, exports y
sus pruebas bajo packages/shared.

```bash
git add -- packages/shared
git diff --cached --check
git commit -m "fix(events): preserve deletion deliveries for every consumer"
```

## 2. Reserva durable y migraciones del outbox IAM

Archivos: repositorio/puerto/relay de outbox, migración 010, changelog 015,
master IAM, Compose y prueba de fencing.

```bash
git add -- services/iam-service/src/shared services/iam-service/db/010_outbox_claim_token.sql services/iam-service/db/changelogs/015_account_deletion_outbox.xml services/iam-service/db/master.xml services/iam-service/tests/shared/outbox_fencing.test.ts docker-compose.yml
git diff --cached --check
git commit -m "fix(iam): fence expired outbox claims and wire migrations"
```

## 3. Dependencias de cuenta IAM heredadas

```bash
git add -- services/iam-service/src/users/adapters/outbound/postgres/account_repository.ts services/iam-service/tests/adapters/users/account_repository.test.ts
git diff --cached --check
git commit -m "fix(iam): erase legacy account dependencies locally"
```

## 4. Analytics: protección atómica y pruebas

Archivos: save/unlink, consumidor, manejo de payload inválido, changelog/master,
pruebas y fixture común exclusivo PG.

```bash
git add -- services/analytics-service tests/helpers/isolated_postgres.ts
git diff --cached --check
git commit -m "fix(analytics): serialize event writes with account deletion"
```

## 5. Recognition: escritores protegidos y política existente

Archivos: guards nuevos, composición de muestras, repositorio/controlador/contratos
de plantillas, consumidor y pruebas. Conserva muestras, consentimiento y autorías.

```bash
git add -- services/recognition-service
git diff --cached --check
git commit -m "fix(recognition): reject writes from locally deleted accounts"
```

## 6. Profile: traducciones concurrentes y consumidor durable

Archivos: suscripción, prueba de payload inválido y dos casos PostgreSQL nuevos.
Los casos PG están preparados pero no ejecutados por falta de acceso aislado.

```bash
git add -- services/profile-service
git diff --cached --check
git commit -m "fix(profile): retain cleanup retries and cover translation races"
```

## 7. Documentación y evidencia

Archivos: README y docs/account-deletion.md, profile-backend.md,
profile-identity-recovery.md, inactive-accounts.md, execution-notes.md y este plan.

```bash
git add -- README.md docs
git diff --cached --check
git commit -m "docs(profile): document deletion guarantees and validation gaps"
```

No hacer push, PR ni despliegue como parte de estos comandos. Confirmar primero
las validaciones reales pendientes documentadas en execution-notes.md.

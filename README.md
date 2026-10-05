# backend-traduce-se-as

API de Traduce Señas (Express + TypeScript + Postgres), organizada por dominios con
arquitectura hexagonal dentro de cada uno.

```
cmd/server/main.ts        # solo monta los routers de cada dominio
src/shared/               # config, Postgres, middleware HTTP, JWT
src/domains/auth/         # registro, login, recuperación de contraseña
src/domains/users/        # /api/users/me
src/domains/translations/ # historial de traducciones
src/domains/ia/           # plantillas de señas y entrenamiento (ver su README)
migrations/               # SQL
DB/                       # changelogs de Liquibase
```

Cada dominio tiene `domain/ application/ ports/ adapters/` y un `*.module.ts` que
compone sus dependencias y expone su `router`.

```
npm install
cp .env.example .env   # completar credenciales
npm run dev            # o: npm run build && npm start
```

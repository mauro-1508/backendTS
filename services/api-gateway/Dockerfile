# Contexto de build: la raiz de backend/ (ver docker-compose.yml)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
# npm ci exige que el lockfile coincida con TODOS los workspaces: se copian
# los package.json de cada uno aunque aqui solo se construya este servicio.
COPY packages/shared/package.json packages/shared/
COPY services/analytics-service/package.json services/analytics-service/
COPY services/api-gateway/package.json services/api-gateway/
COPY services/iam-service/package.json services/iam-service/
COPY services/lexicon-service/package.json services/lexicon-service/
COPY services/profile-service/package.json services/profile-service/
COPY services/recognition-service/package.json services/recognition-service/
# --ignore-scripts: ninguna dependencia ejecuta codigo al instalarse.
RUN npm ci --ignore-scripts -w @traduce/shared -w @traduce/api-gateway --include-workspace-root=false
COPY packages/shared packages/shared
COPY services/api-gateway services/api-gateway
RUN npm run build -w @traduce/shared -w @traduce/api-gateway

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Los DNS lentos de servicios caidos no deben agotar los 4 hilos por defecto y
# dejar sin resolver a los que si responden (health agregado en paralelo).
ENV UV_THREADPOOL_SIZE=16
COPY package*.json ./
# npm ci exige que el lockfile coincida con TODOS los workspaces: se copian
# los package.json de cada uno aunque aqui solo se construya este servicio.
COPY packages/shared/package.json packages/shared/
COPY services/analytics-service/package.json services/analytics-service/
COPY services/api-gateway/package.json services/api-gateway/
COPY services/iam-service/package.json services/iam-service/
COPY services/lexicon-service/package.json services/lexicon-service/
COPY services/profile-service/package.json services/profile-service/
COPY services/recognition-service/package.json services/recognition-service/
RUN npm ci --omit=dev --ignore-scripts -w @traduce/shared -w @traduce/api-gateway --include-workspace-root=false \
 && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/api-gateway/dist services/api-gateway/dist
WORKDIR /app/services/api-gateway
# Sin privilegios: el proceso no necesita root.
USER node
EXPOSE 8080
# Docker marca el contenedor como healthy solo cuando /health responde;
# compose espera ese estado antes de levantar el gateway.
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health > /dev/null || exit 1
CMD ["node", "dist/cmd/main.js"]

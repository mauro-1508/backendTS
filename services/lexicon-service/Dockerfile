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
RUN npm ci --ignore-scripts -w @traduce/shared -w @traduce/lexicon-service --include-workspace-root=false
COPY packages/shared packages/shared
COPY services/lexicon-service services/lexicon-service
RUN npm run build -w @traduce/shared -w @traduce/lexicon-service

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
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
RUN npm ci --omit=dev --ignore-scripts -w @traduce/shared -w @traduce/lexicon-service --include-workspace-root=false \
 && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/lexicon-service/dist services/lexicon-service/dist
# Modelos 3D y miniaturas que sirve /api/lexicon/media
COPY --from=build /app/services/lexicon-service/public services/lexicon-service/public
WORKDIR /app/services/lexicon-service
# Sin privilegios: el proceso no necesita root.
USER node
EXPOSE 3003
CMD ["node", "dist/cmd/main.js"]

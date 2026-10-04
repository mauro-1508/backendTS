# Contexto de build: la raiz de backend/ (ver docker-compose.yml)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/lexicon-service/package.json services/lexicon-service/
RUN npm install -w @traduce/shared -w @traduce/lexicon-service --include-workspace-root=false
COPY packages/shared packages/shared
COPY services/lexicon-service services/lexicon-service
RUN npm run build -w @traduce/shared -w @traduce/lexicon-service

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY services/lexicon-service/package.json services/lexicon-service/
RUN npm install --omit=dev -w @traduce/shared -w @traduce/lexicon-service --include-workspace-root=false
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/lexicon-service/dist services/lexicon-service/dist
# Modelos 3D y miniaturas que sirve /api/lexicon/media
COPY --from=build /app/services/lexicon-service/public services/lexicon-service/public
WORKDIR /app/services/lexicon-service
EXPOSE 3003
CMD ["node", "dist/cmd/main.js"]

# Contexto de build: la raiz de backend/ (ver docker-compose.yml)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/recognition-service/package.json services/recognition-service/
RUN npm install -w @traduce/shared -w @traduce/recognition-service --include-workspace-root=false
COPY packages/shared packages/shared
COPY services/recognition-service services/recognition-service
RUN npm run build -w @traduce/shared -w @traduce/recognition-service

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY services/recognition-service/package.json services/recognition-service/
RUN npm install --omit=dev -w @traduce/shared -w @traduce/recognition-service --include-workspace-root=false
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/recognition-service/dist services/recognition-service/dist
WORKDIR /app/services/recognition-service
EXPOSE 3002
CMD ["node", "dist/cmd/main.js"]

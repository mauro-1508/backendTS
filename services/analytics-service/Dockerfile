# Contexto de build: la raiz de backend/ (ver docker-compose.yml)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/analytics-service/package.json services/analytics-service/
RUN npm install -w @traduce/shared -w @traduce/analytics-service --include-workspace-root=false
COPY packages/shared packages/shared
COPY services/analytics-service services/analytics-service
RUN npm run build -w @traduce/shared -w @traduce/analytics-service

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY services/analytics-service/package.json services/analytics-service/
RUN npm install --omit=dev -w @traduce/shared -w @traduce/analytics-service --include-workspace-root=false
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/analytics-service/dist services/analytics-service/dist
WORKDIR /app/services/analytics-service
EXPOSE 3004
CMD ["node", "dist/cmd/main.js"]

# Contexto de build: la raiz de backend/ (ver docker-compose.yml)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api-gateway/package.json services/api-gateway/
RUN npm install -w @traduce/shared -w @traduce/api-gateway --include-workspace-root=false
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
COPY packages/shared/package.json packages/shared/
COPY services/api-gateway/package.json services/api-gateway/
RUN npm install --omit=dev -w @traduce/shared -w @traduce/api-gateway --include-workspace-root=false
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/services/api-gateway/dist services/api-gateway/dist
WORKDIR /app/services/api-gateway
EXPOSE 8080
CMD ["node", "dist/cmd/main.js"]

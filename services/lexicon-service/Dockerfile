FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY cmd cmd
COPY src src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Modelos 3D y miniaturas que sirve /api/lexicon/media
COPY public ./public
USER node
EXPOSE 3003
CMD ["node", "dist/cmd/main.js"]

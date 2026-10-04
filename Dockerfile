FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
# Modelos 3D y miniaturas que sirve el dominio lexicon en /api/lexicon/media
COPY --from=build /app/public ./public

EXPOSE 3000

CMD ["node", "dist/cmd/server/main.js"]

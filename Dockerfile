# syntax=docker/dockerfile:1
# Build context: repository root (not backend/)
# Serves API + student Mini App at /app

# ---- student Mini App ----
FROM node:20-bookworm-slim AS webapp-builder
WORKDIR /webapp
COPY webapp/package.json webapp/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY webapp/ ./
ENV VITE_API_URL=
ENV VITE_BASE=/app/
RUN npm run build && test -f dist/index.html

# ---- API bundle ----
FROM node:20-bookworm-slim AS api-builder
WORKDIR /app
RUN npm install --no-audit --no-fund esbuild@0.25.0
RUN npm install --no-audit --no-fund \
  express@4.21.2 dotenv@17.2.3 cors@2.8.5 bcryptjs@2.4.3 jsonwebtoken@9.0.2
RUN npm install --no-audit --no-fund @google/genai@2.4.0 || true
COPY backend/src ./src
RUN ./node_modules/.bin/esbuild src/index.ts \
  --bundle --platform=node --target=node20 --format=esm \
  --outfile=dist/index.js \
  --external:@libsql/client --external:libsql --external:sharp \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  && test -f dist/index.js

# ---- runtime ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY backend/package.json ./
RUN npm install --no-audit --no-fund @libsql/client@0.14.0 sharp@0.33.5
COPY --from=api-builder /app/dist ./dist
COPY --from=webapp-builder /webapp/dist ./public/webapp
RUN test -f dist/index.js && test -f public/webapp/index.html
EXPOSE 3000
CMD ["node", "dist/index.js"]

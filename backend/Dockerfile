# syntax=docker/dockerfile:1
# Multi-stage: avoid full npm install crash on Railway Metal builders
# ("npm error Exit handler never called")

# ---- Stage 1: bundle application (express etc. inlined) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install in small steps — full lockfile installs crash on Metal builders
RUN npm install --no-audit --no-fund esbuild@0.25.0
RUN npm install --no-audit --no-fund \
  express@4.21.2 \
  dotenv@17.2.3 \
  cors@2.8.5 \
  bcryptjs@2.4.3 \
  jsonwebtoken@9.0.2
RUN npm install --no-audit --no-fund @google/genai@2.4.0 \
  || echo "[builder] @google/genai optional install skipped"

COPY src ./src

# sharp is a native module — must not be bundled
RUN ./node_modules/.bin/esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=dist/index.js \
  --external:@libsql/client \
  --external:libsql \
  --external:sharp \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  && test -f dist/index.js \
  && wc -c dist/index.js

# ---- Stage 2: runtime (native drivers + bundled app) ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
# Turso client + sharp (image crop for diagram MCQs) — native packages stay external
RUN npm install --no-audit --no-fund @libsql/client@0.14.0 sharp@0.33.5 \
  && test -d node_modules/@libsql \
  && test -d node_modules/sharp

COPY --from=builder /app/dist ./dist
RUN test -f dist/index.js

# Railway injects PORT — do not hardcode
EXPOSE 3000
CMD ["node", "dist/index.js"]

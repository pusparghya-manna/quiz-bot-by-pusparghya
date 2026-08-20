# ---- build: bundle app code; leave npm packages external (installed at runtime) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN npm install --no-audit --no-fund esbuild@0.25.0
COPY src ./src
RUN ./node_modules/.bin/esbuild src/index.ts \
  --bundle --platform=node --target=node20 --format=esm \
  --packages=external \
  --outfile=dist/index.js \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  && test -f dist/index.js

# ---- runtime: full node_modules + dist ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  || (sleep 5 && npm install --omit=dev --no-audit --no-fund --prefer-online) \
  || (sleep 5 && npm install --omit=dev --no-audit --no-fund --legacy-peer-deps)
# Fail build if express missing (the previous production crash)
RUN test -d node_modules/express && test -d node_modules/@libsql
COPY --from=builder /app/dist ./dist
RUN test -f dist/index.js
EXPOSE 3000
CMD ["node", "dist/index.js"]

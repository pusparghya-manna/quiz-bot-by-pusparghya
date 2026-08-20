# ---- builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Some Railway Metal builds hit npm "Exit handler never called"; retry + explicit esbuild
COPY package.json package-lock.json ./
RUN set -eux; \
  npm install --no-audit --no-fund || npm install --no-audit --no-fund; \
  test -d node_modules; \
  npm install --no-save --no-audit esbuild@0.25.0 || true; \
  ./node_modules/.bin/esbuild --version || npx --yes esbuild@0.25.0 --version

COPY src ./src
COPY tsconfig.json ./

RUN set -eux; \
  ESBUILD="./node_modules/.bin/esbuild"; \
  if [ ! -x "$ESBUILD" ]; then ESBUILD="npx --yes esbuild@0.25.0"; fi; \
  $ESBUILD src/index.ts \
    --bundle --platform=node --target=node20 --format=esm \
    --outfile=dist/index.js \
    --external:@libsql/client --external:libsql \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"; \
  test -f dist/index.js; \
  ls -la dist/index.js

# ---- runtime ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Runtime needs @libsql native bindings; app code is already bundled
RUN set -eux; \
  npm install --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund; \
  test -d node_modules/@libsql || test -d node_modules/@libsql/client || true

COPY --from=builder /app/dist ./dist

# Railway injects PORT — do not hardcode
EXPOSE 3000
CMD ["node", "dist/index.js"]

# ---- build: only needs esbuild (app is fully bundled except @libsql) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN npm install --no-audit --no-fund esbuild@0.25.0
COPY src ./src
RUN node node_modules/esbuild/bin/esbuild src/index.ts \
  --bundle --platform=node --target=node20 --format=esm \
  --outfile=dist/index.js \
  --external:@libsql/client --external:libsql \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  && test -f dist/index.js

# ---- runtime ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  || (sleep 3 && npm install --omit=dev --no-audit --no-fund) \
  || (sleep 5 && npm install @libsql/client --no-audit --no-fund)
COPY --from=builder /app/dist ./dist
RUN test -f dist/index.js
EXPOSE 3000
CMD ["node", "dist/index.js"]

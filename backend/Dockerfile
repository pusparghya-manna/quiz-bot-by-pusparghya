# ---- build (creates dist/index.js inside the image) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
RUN npx --yes esbuild@0.25.0 src/index.ts \
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
# Full prod deps so @libsql native bindings are present
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Native Turso driver only — application is pre-bundled in dist/
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts \
  || npm install --omit=dev --no-audit --no-fund \
  || npm install @libsql/client --no-audit --no-fund

COPY dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]

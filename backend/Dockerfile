# Pre-built dist is in the repo; runtime only installs node_modules
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  || (sleep 5 && npm install --omit=dev --no-audit --no-fund --prefer-online)
RUN test -d node_modules/express && test -d node_modules/@libsql/client
COPY dist ./dist
RUN test -f dist/index.js
EXPOSE 3000
CMD ["node", "dist/index.js"]

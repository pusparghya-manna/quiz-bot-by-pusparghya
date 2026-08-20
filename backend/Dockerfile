FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Explicit package list is faster/more reliable than full lock on flaky builders
RUN npm install --omit=dev --no-audit --no-fund \
  express@4.21.2 \
  @libsql/client@0.14.0 \
  dotenv@17.2.3 \
  cors@2.8.5 \
  bcryptjs@2.4.3 \
  jsonwebtoken@9.0.2 \
  @google/genai@2.4.0 \
  || npm install --omit=dev --no-audit --no-fund
RUN test -d node_modules/express && test -d node_modules/@libsql
COPY dist ./dist
RUN test -f dist/index.js
EXPOSE 3000
CMD ["node", "dist/index.js"]

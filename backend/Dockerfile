FROM node:20-slim
WORKDIR /app

# Install dependencies first (better layer cache)
COPY package.json package-lock.json ./
RUN npm install

# App source + build
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
# Runtime has full node_modules including express
CMD ["node", "dist/index.js"]

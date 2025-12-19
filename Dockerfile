FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build client and prepare server assets (including config)
COPY . .
RUN npm run build && cp -r config dist/config

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only prod deps
COPY package*.json ./
RUN npm ci --omit=dev

# Bring over built assets
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server/index.js"]

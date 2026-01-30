# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Copy non-TS assets (tsc only outputs .ts files, not JSON/templates)
# When adding new asset directories, add COPY instruction here
COPY src/messages/ ./dist/messages/
COPY src/flows/ ./dist/flows/

USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]

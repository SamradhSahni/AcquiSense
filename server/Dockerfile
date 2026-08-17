# ── Node.js Server Dockerfile ─────────────────────────────────────────────────
FROM node:20-alpine AS base

RUN apk add --no-cache curl

WORKDIR /app

# ── Development stage (hot-reload via nodemon) ────────────────────────────────
FROM base AS development
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ── Production stage ──────────────────────────────────────────────────────────
FROM base AS production
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 4000
CMD ["node", "src/app.js"]

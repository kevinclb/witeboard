# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install canvas native dependencies (Cairo, Pango, etc.) for node-canvas
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev \
    python3

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/client/package.json ./packages/client/
COPY packages/server/package.json ./packages/server/

# Install dependencies (including native canvas compilation)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client
COPY packages/server ./packages/server

# Build shared types
RUN pnpm --filter @witeboard/shared build

# Accept Clerk key as build arg (Railway passes env vars as build args)
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# Build client (Vite) - VITE_ env vars are embedded at build time
RUN pnpm --filter @witeboard/client build

# Build server (TypeScript)
RUN pnpm --filter @witeboard/server build

# Production stage
FROM node:20-alpine AS runner

# Install canvas runtime dependencies (no build tools needed)
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    librsvg \
    pixman

WORKDIR /app

# Copy package files (needed for pnpm workspace resolution)
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# Copy pre-built node_modules from builder (includes compiled canvas)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/server/node_modules ./packages/server/node_modules

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/server/public

# Set environment
ENV NODE_ENV=production
# Note: Railway injects PORT automatically, don't hardcode it

# Start server
CMD ["node", "packages/server/dist/index.js"]


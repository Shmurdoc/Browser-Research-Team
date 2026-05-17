# ============================================================
# Design Pattern Multiverse — Production Dockerfile
# ============================================================
# Multi-stage build: build in Node 20, run in slim image.
# No dev dependencies, no source code, no tests in production.
# ============================================================

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
COPY mcp-server/ ./mcp-server/
COPY cli/ ./cli/

RUN npm run build

# ============================================================
# Production image
# ============================================================

FROM node:20-alpine AS production

WORKDIR /app

# Install Playwright dependencies for Chromium
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  tini

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
  adduser -u 1001 -S appuser -G appgroup

# Copy production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy built application
COPY --from=builder /app/dist ./dist

# Create storage directory
RUN mkdir -p /app/patterns && chown -R appuser:appgroup /app

USER appuser

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV NODE_ENV=production

EXPOSE 3000

# Use tini as init system for proper signal handling
ENTRYPOINT ["tini", "--"]

# Default: run web server
CMD ["node", "dist/src/web-server/index.js"]

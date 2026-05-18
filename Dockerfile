# ============================================================
# Design Pattern Multiverse — Production Dockerfile
# ============================================================
# Multi-stage build with security hardening:
# - Non-root user
# - Minimal attack surface
# - Health checks
# - Read-only filesystem where possible
# ============================================================

# ============================================================
# Stage 1: Build
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
COPY mcp-server/ ./mcp-server/
COPY cli/ ./cli/

RUN npm run build

# ============================================================
# Stage 2: Production
# ============================================================
FROM node:22-alpine AS production

# Install only required system dependencies
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  tini \
  curl \
  && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
  adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && \
  npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Create required directories with proper ownership
RUN mkdir -p /app/patterns /app/logs /app/images && \
  chown -R appuser:appgroup /app

USER appuser

# Environment
ENV PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV NODE_ENV=production
ENV DPM_STORAGE_DIR=/app/patterns
ENV DPM_LOG_DIR=/app/logs

EXPOSE 3000 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3100/health || curl -f http://localhost:3000/health || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["tini", "--"]

# Default: run web server
CMD ["node", "dist/src/web-server/index.js"]

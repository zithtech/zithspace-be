# Multi-stage build for z-backend-v2
# Stage 1: Build TypeScript application
FROM node:22-alpine AS builder

# Install necessary packages for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema first
COPY prisma/ ./prisma/

# Install ALL dependencies (devDependencies are needed to compile TypeScript).
# This stage is discarded, so it does not affect the final image size.
RUN npm ci && \
    npx prisma generate

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine

# Install Chromium and dependencies for Puppeteer in production
# Install openssl for Prisma compatibility
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    tini \
    openssl \
    && ln -s /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 || true

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema first
COPY --chown=nodejs:nodejs prisma/ ./prisma/

# Copy package.json to modify module alias
COPY --chown=nodejs:nodejs package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force && \
    npx prisma generate

# Fix module alias for production - change @ from 'src' to 'dist'
RUN npm pkg set '_moduleAliases[@]'='dist'

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy uploads directory (if needed)
RUN mkdir -p /app/uploads && chown nodejs:nodejs /app/uploads

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5001

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/app.js"]

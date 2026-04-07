# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files
COPY package.json bunfig.toml ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build Vite assets
RUN bun run build

# Production stage
FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bunfig.toml ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Copy public assets
COPY public ./public

# Copy server and config files
COPY server.ts index.html tsconfig.json vite.config.ts zosite.json ./

# Copy backend-lib if it exists
COPY backend-lib ./backend-lib

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "await fetch('http://localhost:8080/').then(() => process.exit(0)).catch(() => process.exit(1))" || exit 1

# Start the app
CMD ["bun", "run", "server.ts"]

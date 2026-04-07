# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files
COPY package.json bunfig.toml ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy all source code
COPY . .

# Build Vite assets
RUN bun run build

# Production stage
FROM oven/bun:latest

WORKDIR /app

# Copy only what we need for production
COPY package.json bunfig.toml ./

# Install production dependencies
RUN bun install --frozen-lockfile --production

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy server code and config
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/zosite.json ./

# Copy backend-lib if present
COPY --from=builder /app/backend-lib ./backend-lib

EXPOSE 8080

CMD ["bun", "run", "server.ts"]


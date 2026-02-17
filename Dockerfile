FROM oven/bun:1 AS base
WORKDIR /app

# Install server dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Install and build dashboard
COPY dashboard/package.json dashboard/bun.lock* dashboard/
RUN cd dashboard && bun install --frozen-lockfile
COPY dashboard/ dashboard/
RUN cd dashboard && bunx vite build

# Copy application code
COPY src/ src/
COPY rooms/ rooms/

# Move dashboard build to dist/
RUN mkdir -p dist && mv dashboard/dist dist/dashboard

# Expose ports: WebSocket + Dashboard, Telnet, MCP
EXPOSE 3300 4000 3301

# Data volume for SQLite
VOLUME ["/app/data"]

# Default environment
ENV DB_PATH=/app/data/artilect.db
ENV LOG_FORMAT=json

CMD ["bun", "run", "src/main.ts"]

# Relay service container (Issue #1935 BETA-028).
# Builds the Node-compatible relay server with bun, then runs it on Node LTS.
# The compose file builds from the repo root with this Dockerfile path so the
# lockfile and source tree are available.
FROM oven/bun:1.3.14-alpine AS builder
WORKDIR /app
COPY bun.lock package.json ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build src/relay/index.ts --target=node --outfile dist/relay/index.js

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/relay/index.js"]

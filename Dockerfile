# syntax=docker/dockerfile:1.4

# ------------------------------------------------------------#
#  Build Layer
# ------------------------------------------------------------#
FROM node:22.11.0-slim as build

WORKDIR /app

# install openssl
RUN \
  apt-get update \
  && apt-get install -y --no-install-recommends \
  openssl=3.0.* \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Update npm | Install pnpm
RUN npm i -g npm@latest; \
  # Install pnpm
  npm install -g pnpm@8.7.6; \
  pnpm --version;

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY ./prisma/ ./prisma/
COPY ./src/ ./src/

RUN pnpm run prisma:generate; \
  pnpm run build;

# ------------------------------------------------------------#
# Run Layer
# ------------------------------------------------------------#
FROM node:22.11.0-slim

WORKDIR /app

ENV PORT=80

# install openssl
RUN \
  apt-get update \
  && apt-get install -y --no-install-recommends \
  openssl=3.0.* \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Copy Prisma schema from build stage
COPY --from=build /app/prisma /app/prisma
# Copy node_modules from build stage
COPY --from=build /app/node_modules /app/node_modules
# Copy dist from build stage
COPY --from=build /app/dist /app/dist

# Copy entrypoint.sh
COPY scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 80

# execute entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

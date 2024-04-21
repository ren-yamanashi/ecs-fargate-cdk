# syntax=docker/dockerfile:1.4

# ------------------------------------------------------------#
#  Build Layer
# ------------------------------------------------------------#
FROM node:20.11.0-slim as build

WORKDIR /app

# OpenSSLのインストール
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

RUN pnpm run prisma:migrate-deploy; \
  pnpm run prisma:generate; \
  pnpm run build;

# ------------------------------------------------------------#
# Run Layer
# ------------------------------------------------------------#
FROM node:20.11.0-slim

WORKDIR /app

ENV PORT=80

# OpenSSLのインストール

RUN \
  apt-get update \
  && apt-get install -y --no-install-recommends \
  openssl=3.0.* \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# build ステージから Prisma スキーマをコピー
COPY --from=build /app/prisma /app/prisma
# build ステージから node_modules をコピー
COPY --from=build /app/node_modules /app/node_modules
# build ステージから dist をコピー
COPY --from=build /app/dist /app/dist

EXPOSE 80

# エントリポイントスクリプトを実行
CMD ["node", "dist/index.js"]

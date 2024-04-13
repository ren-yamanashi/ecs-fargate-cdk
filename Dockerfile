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
RUN npm i -g npm@latest;

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY ./src/ ./src/

RUN npm run build;

# ------------------------------------------------------------#
# Run Layer
# ------------------------------------------------------------#
FROM node:20.11.0-slim

WORKDIR /app

ENV PORT=80
ENV APP_ENV=development

# OpenSSLのインストール

RUN \
  apt-get update \
  && apt-get install -y --no-install-recommends \
  openssl=3.0.* \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# build ステージから node_modules をコピー
COPY --from=build /app/node_modules /app/node_modules
# build ステージから dist をコピー
COPY --from=build /app/dist /app/dist

EXPOSE 80

# エントリポイントスクリプトを実行
CMD ["node", "dist/index.js"]

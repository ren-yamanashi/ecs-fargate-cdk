#!/bin/bash

# .env作成
cp default.env .env

# 依存ライブラリインストール
pnpm install --frozen-lockfile

# コンテナ起動
pnpm docker-up:db

# migration実行
sh ./scripts/migration.sh

# prisma client生成
pnpm prisma:generate

sh ./scripts/entrypoint.sh
#!/bin/bash

# .env作成
cp default.env .env

# 依存ライブラリインストール
pnpm install --frozen-lockfile

# コンテナ起動
pnpm run docker-up:db

# migration実行
sh ./scripts/migration.sh

# prisma client生成
pnpm run prisma:generate

echo ".env ファイルの 'CDK_DEFAULT_ACCOUNT' を設定してください。"

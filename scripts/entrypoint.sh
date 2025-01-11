#!/bin/bash

# DATABASE_URLの生成に使用する環境変数の存在確認
for var in DATABASE_ENGINE DATABASE_USERNAME DATABASE_PASSWORD DATABASE_HOST DATABASE_PORT DATABASE_NAME; do
	if [ -z "${!var}" ]; then
		echo "Error: 環境変数 '$var' が設定されていません。"
		exit 1
	fi
done

export DATABASE_URL=${DATABASE_ENGINE}://${DATABASE_USERNAME}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}

npx prisma migrate deploy
npx prisma generate
node dist/index.js

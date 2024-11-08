#!/bin/bash

# TODO: データベースが作成されるまで待機するロジックを追加

# NOTE: sample_dbデータベースが作成された後にmigrationを実行
pnpm run prisma:migrate-deploy

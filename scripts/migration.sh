#!/bin/bash
check_db_exists() {
  docker exec -it ecs-fargate-cdk-mysql mysql -u default -pdefault -e "SHOW DATABASES;" | grep -w 'sample_db'
}

# NOTE: sample_dbデータベースが作成されるまで待機
echo "Waiting for 'sample_db' database to be created..."
DB_EXISTS=$(check_db_exists)
while [ -z "$DB_EXISTS" ]; do
  sleep 5
  DB_EXISTS=$(check_db_exists)
  echo "Waiting..."
done

echo "'sample_db' database has been created."

# NOTE: sample_dbデータベースが作成された後にmigrationを実行
pnpm prisma:migrate-deploy

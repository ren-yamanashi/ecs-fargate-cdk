#!/bin/bash
export DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}
echo "DATABASE_URL: ${DATABASE_URL}"
npx prisma migrate deploy
npx prisma generate
node dist/index.js

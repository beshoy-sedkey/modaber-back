#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Starting application..."
exec "$@"

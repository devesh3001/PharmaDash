#!/bin/sh
set -e

echo "Applying database schema..."
npx prisma db push --skip-generate

echo "Starting PharmaDash API..."
exec node dist/index.js

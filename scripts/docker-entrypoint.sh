#!/bin/sh
set -e

echo "Applying database schema..."
npx prisma migrate deploy

echo "Starting PharmaDash API..."
exec node dist/index.js

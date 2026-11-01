#!/bin/sh
# Applies committed migrations before serving, then hands over to the CMD.
# Migrations are idempotent and Prisma takes an advisory lock, so rolling
# deploys are safe. Set RUN_MIGRATIONS=false when a separate job owns them
# (avoids giving the app DB DDL rights in locked-down environments).
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "applying database migrations"
  npx prisma migrate deploy
fi

exec "$@"

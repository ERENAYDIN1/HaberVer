#!/bin/sh
set -e

echo "[entrypoint] Migration'lar uygulaniyor..."
alembic upgrade head

echo "[entrypoint] Uygulama baslatiliyor..."
exec "$@"

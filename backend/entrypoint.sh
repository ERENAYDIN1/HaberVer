#!/bin/sh
set -e

echo "[entrypoint] Migration'lar uygulaniyor..."
alembic upgrade head

# Ilk admin Keycloak'ta acilir ve yerel satirla eslenir. Keycloak'in acilmasini
# script kendisi bekler. Basarisiz olursa uygulama YINE DE baslar: API ayakta
# kalir, yalnizca giris yapilamaz - hatayi loglardan gormek, konteyneri yeniden
# baslatma dongusune sokmaktan iyidir.
echo "[entrypoint] Keycloak admin hesabi hazirlaniyor..."
python scripts/keycloak_bootstrap.py || echo "[entrypoint] UYARI: Keycloak bootstrap basarisiz"

echo "[entrypoint] Uygulama baslatiliyor..."
exec "$@"

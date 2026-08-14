"""bolgeler.alan_m2 / guzergahlar.uzunluk_m kalici sutun oldu

Bu olculer eskiden yalnizca sorgu aninda PostGIS ile hesaplaniyordu
(crud/bolge.py::_select_with_geo, ST_Area/ST_Length). Kalici sutuna
tasindi: yazma aninda (create/update) hesaplanip yazilir, okuma
sorgusu artik dogrudan sutunu okur.

Once nullable eklenir, mevcut satirlar PostGIS ile doldurulur, sonra
NOT NULL yapilir - dolu bir tabloya dogrudan NOT NULL kolon eklenemez.

Revision ID: 0018
Revises: 0017
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE bolgeler ADD COLUMN alan_m2 double precision")
    op.execute(
        "UPDATE bolgeler SET alan_m2 = ST_Area(geom::geography)"
    )
    op.execute("ALTER TABLE bolgeler ALTER COLUMN alan_m2 SET NOT NULL")

    op.execute("ALTER TABLE guzergahlar ADD COLUMN uzunluk_m double precision")
    op.execute(
        "UPDATE guzergahlar SET uzunluk_m = ST_Length(geom::geography)"
    )
    op.execute("ALTER TABLE guzergahlar ALTER COLUMN uzunluk_m SET NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE bolgeler DROP COLUMN alan_m2")
    op.execute("ALTER TABLE guzergahlar DROP COLUMN uzunluk_m")

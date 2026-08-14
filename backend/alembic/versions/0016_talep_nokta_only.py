"""Vatandas talebi yalnizca NOKTA: reports.geometry POINT'e daraltildi

0008 ile vatandas bir yol catlagini cizgi, bir cukur alanini poligon olarak da
bildirebiliyordu. Ozellik geri alindi: sahada isin buyuklugunu vatandasin
parmakla cizdigi sekil degil, personelin onaydan sonra actigi bolge/guzergah
kaydi tasiyor (bkz. 0015). Vatandas tarafinda cizim, formu ogrenilmesi zor ve
yanlis cizilmesi kolay bir adima cevirmisti.

`nokta` sutunu KORUNUR. Artik her zaman `geometry`nin kendisiyle ayni degeri
tasiyacak, ama harita pini/mesafe/yaka zincirinin tamami onu okuyor; kaldirmak
kazanci olmayan genis bir degisiklik olurdu ve ozellik geri istenirse yol
kapanirdi.

REDDEDER, kirpmaz: nokta disi geometri iceren satir varsa migration hata verir
(0008'in downgrade'indeki ayni tavir). Bu satirlar sessizce noktaya cevrilseydi
vatandasin gonderdigi belge kaybolurdu; once ne yapilacagina karar verilmeli.

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sayi = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT count(*) FROM reports"
                " WHERE ST_GeometryType(geometry) <> 'ST_Point'"
            )
        )
        .scalar_one()
    )
    if sayi:
        raise RuntimeError(
            f"{sayi} talep nokta disi (cizgi/alan) geometri iceriyor; bu"
            " migration onlari kaybederdi. Once bu kayitlari silin veya"
            " temsil noktalarina (reports.nokta) donusturun."
        )

    op.execute(
        "ALTER TABLE reports ALTER COLUMN geometry"
        " TYPE geometry(Point, 4326) USING geometry::geometry(Point, 4326)"
    )


def downgrade() -> None:
    # Gevsetme: mevcut noktalar oldugu gibi gecer, veri kaybi yok.
    op.execute(
        "ALTER TABLE reports ALTER COLUMN geometry"
        " TYPE geometry(Geometry, 4326) USING geometry::geometry(Geometry, 4326)"
    )

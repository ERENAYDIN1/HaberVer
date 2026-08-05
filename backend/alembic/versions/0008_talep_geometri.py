"""Talep geometrisi: nokta / cizgi / alan + vatandasin listeden kaldirmasi

Vatandas artik yalnizca bir nokta isaretlemiyor; bir yol catlagini CIZGI, bir
cukur alani POLIGON olarak da bildirebiliyor. Bir yol catlagi nokta degildir ve
tek noktaya sikistirilinca sahadaki isin buyuklugu kayboluyordu.

Iki kolonlu cozum, bilincli:

  * `geometry` artik serbest tiptedir (POINT/LINESTRING/POLYGON) - vatandasin
    cizdigi HAM SEKIL, bir belge olarak oldugu gibi durur.
  * `nokta` seklin TEMSIL NOKTASIDIR ve her zaman doludur. Harita pini,
    otomatik atamanin ST_DistanceSphere mesafesi ve yaka cozumlemesi
    (crud/yaka.py) bu kolonu okur; boylece atama/yaka/harita altyapisinin
    hicbiri cok geometriye uyarlanmak zorunda kalmaz. Onaylanan talepten
    olusan `assets` satiri da POINT kalir - `assets` tablosuna hic dokunulmaz.

Sekil TIPI icin ayri kolon yok: `geometry`nin GeoJSON `type`indan turer, boylece
iki yerde tutulan bilgi tutarsizlasamaz.

`reporter_hidden_at`: vatandasin "listemden kaldir"i. Gercek silme degil -
onaylanmis bir talep silinseydi ona bagli varlik, atama ve audit log sahipsiz
kalirdi. Satir yerinde durur, yalnizca /reports/mine listesinden dusulur.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Bir geometrinin temsil noktasi. ST_PointOnSurface poligonlarda centroid'in
# aksine her zaman SEKLIN ICINE duser (U seklindeki bir alanda centroid disarida
# kalabilir); cizgide hattin tam ortasi alinir, cunku nokta ortalamasi L
# seklindeki bir rotada hattin hic gecmedigi bir yere duserdi.
TEMSIL_NOKTASI_SQL = """
    CASE ST_GeometryType(geometry)
        WHEN 'ST_Point' THEN geometry
        WHEN 'ST_LineString' THEN ST_LineInterpolatePoint(geometry, 0.5)
        ELSE ST_PointOnSurface(geometry)
    END
"""


def upgrade() -> None:
    # POINT -> GEOMETRY: kisitin gevsetilmesi, mevcut satirlar oldugu gibi gecer.
    op.execute(
        "ALTER TABLE reports ALTER COLUMN geometry"
        " TYPE geometry(Geometry, 4326) USING geometry::geometry(Geometry, 4326)"
    )

    # Once nullable eklenir, mevcut satirlar doldurulur, sonra NOT NULL yapilir:
    # dolu bir tabloya dogrudan NOT NULL kolon eklenemez.
    op.execute("ALTER TABLE reports ADD COLUMN nokta geometry(Point, 4326)")
    op.execute(f"UPDATE reports SET nokta = {TEMSIL_NOKTASI_SQL}")
    op.execute("ALTER TABLE reports ALTER COLUMN nokta SET NOT NULL")
    op.create_index("idx_reports_nokta", "reports", ["nokta"], postgresql_using="gist")

    op.add_column(
        "reports",
        sa.Column("reporter_hidden_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    # Geri donus VERI KAYBEDER: cizgi/alan iceren satirlar POINT sutununa
    # sigmaz. Sessizce kirpmak yerine acikca reddediliyor - once bu satirlarin
    # ne yapilacagina karar verilmeli.
    sayi = (
        op.get_bind()
        .execute(
            sa.text("SELECT count(*) FROM reports WHERE ST_GeometryType(geometry) <> 'ST_Point'")
        )
        .scalar_one()
    )
    if sayi:
        raise RuntimeError(
            f"{sayi} talep nokta disi geometri iceriyor; downgrade bunlari"
            " kaybederdi. Once bu kayitlari silin veya noktaya donusturun."
        )

    op.drop_column("reports", "reporter_hidden_at")
    op.drop_index("idx_reports_nokta", table_name="reports")
    op.drop_column("reports", "nokta")
    op.execute(
        "ALTER TABLE reports ALTER COLUMN geometry"
        " TYPE geometry(Point, 4326) USING geometry::geometry(Point, 4326)"
    )

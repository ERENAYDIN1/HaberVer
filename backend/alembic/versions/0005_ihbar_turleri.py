"""Ihbar/varlik turlerinin genisletilmesi (asset_type 3 -> 13)

Vatandastan gelen ihbarlar cok cesitli oluyor (rogar kapagi, yol cukuru, kirik
bank, cop konteyneri...) ama `asset_type` yalnizca agac/direk/sulama iceriyordu;
vatandas mecburen alakasiz bir tur seciyordu. Enum vatandasin gercek sozlugune
genisletiliyor. `reports.type` ile `assets.type` ayni PG enum'unu paylastigi
icin (bkz. models/report.py) tek ALTER TYPE her ikisini de kapsar.

`bank` bilinctli olarak GERI getiriliyor: daha once envanteri sadelestirmek icin
kaldirilmisti, ama kirik bank en tipik vatandas ihbari.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Arayuzdeki gruplariyla (bkz. frontend types/asset.ts TIP_GRUBU):
#   yol ve kaldirim -> rogar, yol, kaldirim, trafik_levhasi
#   yesil alan/park -> bank, cop_kutusu, oyun_grubu
#   aydinlatma      -> elektrik_panosu
#   altyapi/su      -> su_hatti
#   diger           -> diger (yalnizca ihbardan gelir, envantere elle eklenmez)
YENI_TURLER = (
    "rogar",
    "yol",
    "kaldirim",
    "bank",
    "cop_kutusu",
    "trafik_levhasi",
    "elektrik_panosu",
    "oyun_grubu",
    "su_hatti",
    "diger",
)


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE PG12+'da islem blogu icinde calisir. Bu migration
    # bilincli olarak hic VERI yazmaz: Postgres ayni transaction icinde yeni
    # eklenen bir enum degerinin KULLANILMASINA izin vermez.
    for deger in YENI_TURLER:
        op.execute(f"ALTER TYPE asset_type ADD VALUE IF NOT EXISTS '{deger}'")

    # Yeni degerler BURADA commit edilir. Alembic tum zinciri tek transaction'da
    # kosturdugu icin, aksi halde sonraki migration'lar (0007 `tur_departman`
    # dolumu) bu degerleri kullanamaz ve sifirdan kurulum
    # `UnsafeNewEnumValueUsage` ile patlar. Mevcut kurulumlarda zincir zaten
    # buradan gecmisti, bu yuzden hata yalnizca TEMIZ kurulumda goruluyordu.
    op.get_bind().execute(sa.text("COMMIT"))


def downgrade() -> None:
    # Enum'a eklenen degerler geri alinmaz (bkz. 0002/0003/0004'teki ayni not).
    # Bir degeri gercekten dusurmek, o degeri kullanan tum satirlarin
    # tasinmasini + tipin yeniden yaratilmasini gerektirir.
    pass

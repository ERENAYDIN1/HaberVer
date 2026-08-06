"""Tur sozlugunden `envanter`, `aktif` ve `sira` sutunlari dusuruldu

Sozlukte bir tur olusturmak tek bir karar olmali: "bu tur hangi mudurluge
gider". Uc ayri gorunurluk/siralama anahtari bu karari uc adima bolup, admin'in
ekledigi turun lejantta ya da vatandasin talep formunda neden cikmadigini
aciklamasi zor bir duruma cevirebiliyordu.

Bundan sonra `turler` tablosundaki her satir her yerde gecerlidir: lejant, filtre,
vatandas talep formu ve personelin envanter formu ayni listeyi gorur. Sira ada
gore cozulur (frontend'de Turkce collation ile).

Kaybolan iki yetenek bilincli olarak birakildi:
  - `envanter=false` ("yalnizca talep kategorisi"): varsayilan 13 turden yalnizca
    `diger` boyleydi; artik personel de envantere `diger` turunde kayit acabilir.
  - `aktif=false` ("emekliye ayirma"): kullanimda olan bir tur FK yuzunden
    silinemedigi icin (409) artik gizlenemez de. Kullanimdan dusen bir turun
    kayitlari once baska bir ture tasinmali, sonra tur silinmeli.

Revision ID: 0013
Revises: 0012
Create Date: 2026-08-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("turler", "envanter")
    op.drop_column("turler", "aktif")
    op.drop_column("turler", "sira")


def downgrade() -> None:
    """Sutunlari geri acar ama ESKI DEGERLERI GERI GETIREMEZ: dusurulen veri
    saklanmiyor. Hepsi varsayilana doner (envanter/aktif true, sira 0), yani
    `diger` turu de envantere acik gelir."""
    op.add_column(
        "turler",
        sa.Column("envanter", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "turler",
        sa.Column("sira", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "turler",
        sa.Column("aktif", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

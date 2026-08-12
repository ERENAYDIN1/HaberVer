"""Talep sekli (cizgi/alan) duzenleme icin log aksiyonu

Vatandas bir yol catlagini/alani yanlis cizmis olabilir; personel artik
bekleyen VEYA onaylanmis bir talebin ham seklini (reports.geometry) haritada
duzenleyebilir - kaydedilmis bolge/guzergah seklinin duzenlenmesiyle ayni
mekanizma (koseleri surukle/ekle/sil). Onaylanmis talepte temsil noktasi
yeniden hesaplanir ve ondan olusan varligin konumu da tasinir.

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-12

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE log_action ADD VALUE IF NOT EXISTS 'report_shape_updated'")


def downgrade() -> None:
    # log_action'a eklenen degerler geri alinmaz (bkz. 0002/0003'teki ayni not).
    pass

"""Gorev bolgesi / guzergah tamamlama

Saha ekibi kendisine atanan bolgeyi (ya da guzergahi) bitirdiginde tamamlandi
olarak isaretleyebiliyor; kayit silinmiyor, "Tamamlanan Isler" altinda kalip
geri alinabiliyor - tekil bakim gorevlerindeki desenle ayni.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

YENI_LOG_DEGERLERI = ("bolge_completed", "bolge_reopened")


def upgrade() -> None:
    for deger in YENI_LOG_DEGERLERI:
        op.execute(f"ALTER TYPE log_action ADD VALUE IF NOT EXISTS '{deger}'")

    op.add_column(
        "gorev_bolgeleri",
        sa.Column("tamamlandi_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "gorev_bolgeleri",
        sa.Column(
            "tamamlayan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("gorev_bolgeleri", "tamamlayan_id")
    op.drop_column("gorev_bolgeleri", "tamamlandi_at")
    # log_action'a eklenen degerler geri alinmaz (bkz. 0002'deki ayni not).

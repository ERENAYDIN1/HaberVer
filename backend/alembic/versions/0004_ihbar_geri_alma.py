"""Reddedilen ihbarin reddini geri alma

Personel yanlislikla reddettigi (ya da sonradan gecerli oldugu anlasilan) bir
ihbari tekrar "beklemede" durumuna cekebiliyor; kayit silinmiyor, inceleme
alanlari (reviewed_by/at, review_note) temizlenip ihbar kuyruga geri donuyor.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-30

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE log_action ADD VALUE IF NOT EXISTS 'report_reopened'")


def downgrade() -> None:
    # log_action'a eklenen degerler geri alinmaz (bkz. 0002/0003'teki ayni not).
    pass

"""assignment_cancelled log action (gorev geri alma / havuza alma)

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-27

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Personel bir gorevi havuza geri aldiginda audit log'a yazilacak yeni deger.
    op.execute("ALTER TYPE log_action ADD VALUE IF NOT EXISTS 'assignment_cancelled'")


def downgrade() -> None:
    # Not: Postgres enum'a eklenen degerler geri alinamaz; birakilir.
    pass

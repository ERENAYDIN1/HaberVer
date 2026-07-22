"""add saha_calisani value to user_role enum

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-22

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'saha_calisani'")


def downgrade() -> None:
    # Postgres enum degerlerini kaldirmayi desteklemez; asagi alma islemi
    # icin yeni enum tipini yeniden olusturup kolonu tasimak gerekir.
    # Bu deger su an kullanimda degilse elle mudahale gerektirir.
    pass

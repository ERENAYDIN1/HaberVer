"""add repaired_at column to assets (Tamir Edildi zamani, otomatik silme icin)

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("repaired_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Onceden tamir edilmis (durumu 'iyi') ihbar kaynakli varliklara suan'i ver:
    # gercek tamir zamani bilinmedigi icin updated_at kullanmak bunlari deploy
    # aninda hemen silebilirdi; now() ile hepsine tam 5 gunluk bir sure taninir.
    op.execute(
        """
        UPDATE assets
        SET repaired_at = now()
        WHERE source = 'ihbar' AND status = 'iyi' AND repaired_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("assets", "repaired_at")

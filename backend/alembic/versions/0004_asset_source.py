"""add asset_source (kayitli/ihbar) column to assets, backfill from reports

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    asset_source = postgresql.ENUM(
        "kayitli", "ihbar", name="asset_source", create_type=False
    )
    asset_source.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "assets",
        sa.Column(
            "source", asset_source, nullable=False, server_default="kayitli"
        ),
    )

    # Zaten onaylanmis ihbarlardan olusan varliklari geriye donuk 'ihbar' olarak isaretle.
    op.execute(
        """
        UPDATE assets
        SET source = 'ihbar'
        WHERE id IN (SELECT created_asset_id FROM reports WHERE created_asset_id IS NOT NULL)
        """
    )


def downgrade() -> None:
    op.drop_column("assets", "source")
    postgresql.ENUM(name="asset_source").drop(op.get_bind(), checkfirst=True)

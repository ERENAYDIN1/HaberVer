"""create assets table

Revision ID: 0001
Revises:
Create Date: 2026-07-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # create_type=False: tipleri aşağıda elle oluşturuyoruz, create_table tekrar denemesin.
    asset_type = postgresql.ENUM(
        "agac", "bank", "direk", name="asset_type", create_type=False
    )
    asset_status = postgresql.ENUM(
        "iyi", "bakim_lazim", name="asset_status", create_type=False
    )
    asset_type.create(op.get_bind(), checkfirst=True)
    asset_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "assets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", asset_type, nullable=False),
        sa.Column("status", asset_status, nullable=False, server_default="iyi"),
        sa.Column(
            "geometry",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("install_date", sa.Date(), nullable=True),
        sa.Column("brand_model", sa.String(255), nullable=True),
        sa.Column("photo_url", sa.String(512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index(
        "idx_assets_geometry",
        "assets",
        ["geometry"],
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_index("idx_assets_geometry", table_name="assets")
    op.drop_table("assets")
    postgresql.ENUM(name="asset_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="asset_type").drop(op.get_bind(), checkfirst=True)

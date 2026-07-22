"""create users and reports tables, seed default admin

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-21

"""
import os
from typing import Sequence, Union

import bcrypt
import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_role = postgresql.ENUM(
        "admin", "calisan", "vatandas", name="user_role", create_type=False
    )
    report_status = postgresql.ENUM(
        "beklemede", "onaylandi", "reddedildi", name="report_status", create_type=False
    )
    user_role.create(op.get_bind(), checkfirst=True)
    report_status.create(op.get_bind(), checkfirst=True)

    # asset_type 0001'de olusturuldu; burada yeniden olusturma, mevcut olani kullan.
    asset_type = postgresql.ENUM(
        "agac", "bank", "direk", name="asset_type", create_type=False
    )

    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("role", user_role, nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "reports",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "reporter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", asset_type, nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "geometry",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("photo_url", sa.String(512), nullable=True),
        sa.Column(
            "status", report_status, nullable=False, server_default="beklemede"
        ),
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column(
            "created_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
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
        "idx_reports_geometry", "reports", ["geometry"], postgresql_using="gist"
    )

    # Varsayilan admin hesabini tohumla (yalnizca hic admin yoksa).
    email = os.environ.get("DEFAULT_ADMIN_EMAIL", "admin@greenasset.com").lower()
    parola = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin1234")
    hashed = bcrypt.hashpw(parola.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    op.execute(
        sa.text(
            """
            INSERT INTO users (email, hashed_password, full_name, role)
            SELECT :email, :hashed, 'Sistem Yoneticisi', 'admin'
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
            """
        ).bindparams(email=email, hashed=hashed)
    )


def downgrade() -> None:
    op.drop_index("idx_reports_geometry", table_name="reports")
    op.drop_table("reports")
    op.drop_table("users")
    postgresql.ENUM(name="report_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="user_role").drop(op.get_bind(), checkfirst=True)

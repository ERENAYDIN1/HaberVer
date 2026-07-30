"""Gorev bolgeleri (kaydedilmis alanlar/cizgiler) + ekibe atama

Haritada cizilen bir alan ya da olculen bir cizgi artik adlandirilip kalici
olarak kaydedilebiliyor; kaydedilen bir ALAN bir saha ekibine 'gorev bolgesi'
olarak atanabiliyor (ekip kendi ekraninda goruyor).

Not: 0001 tek baseline'dir ve degistirilmez (bkz. CLAUDE.md / Migration
Yapisi); sema degisiklikleri bu dosyadan itibaren ustune yazilir.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

YENI_LOG_DEGERLERI = (
    "bolge_created",
    "bolge_updated",
    "bolge_deleted",
    "bolge_assigned",
)


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE PG12+'da islem blogu icinde calisir; eklenen
    # deger ayni islemde KULLANILAMAZ - bu migration da kullanmiyor.
    for deger in YENI_LOG_DEGERLERI:
        op.execute(f"ALTER TYPE log_action ADD VALUE IF NOT EXISTS '{deger}'")

    # create_type=False: tip burada acikca olusturulur, create_table tekrar
    # yaratmaya calismasin (0001'deki desenle ayni).
    bolge_tipi = postgresql.ENUM("alan", "cizgi", name="bolge_tipi", create_type=False)
    bolge_tipi.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "gorev_bolgeleri",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("ad", sa.String(120), nullable=False),
        sa.Column("aciklama", sa.Text(), nullable=True),
        sa.Column("tip", bolge_tipi, nullable=False),
        sa.Column("renk", sa.String(9), nullable=False, server_default="#059669"),
        # Tek sutunda iki geometri turu: alan -> MULTIPOLYGON, cizgi -> LINESTRING.
        # Indeks asagida acikca olusturulur (spatial_index=False).
        sa.Column(
            "geom",
            Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column(
            "worker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "assigned_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
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
        "idx_gorev_bolgeleri_geom",
        "gorev_bolgeleri",
        ["geom"],
        postgresql_using="gist",
    )
    # Ekibin kendi bolgelerini cekmesi (GET /api/bolgeler/benim) icin.
    op.create_index("idx_gorev_bolgeleri_worker", "gorev_bolgeleri", ["worker_id"])


def downgrade() -> None:
    op.drop_index("idx_gorev_bolgeleri_worker", table_name="gorev_bolgeleri")
    op.drop_index("idx_gorev_bolgeleri_geom", table_name="gorev_bolgeleri")
    op.drop_table("gorev_bolgeleri")
    postgresql.ENUM(name="bolge_tipi").drop(op.get_bind(), checkfirst=True)
    # log_action'a eklenen degerler geri alinmaz: PostgreSQL enum'dan deger
    # kaldirmayi desteklemiyor (tipi yeniden yaratmak gerekirdi). Fazladan
    # deger kalmasi zararsizdir.

"""Gorev bolgeleri ikiye ayrildi: bolgeler (alan) + guzergahlar (cizgi)

`gorev_bolgeleri` tek tabloda `tip` enum'uyla iki farkli geometriyi tutuyordu:
alan -> MULTIPOLYGON, cizgi -> LINESTRING. Tek sutunda iki geometri turu her
sorguda `CASE tip WHEN ...` dallanmasi demekti (temsil noktasi, olcu, nokta
listesi) ve sutun tipi GEOMETRY oldugu icin veritabani "bu satirda gercekten
poligon var mi"yi hicbir zaman garanti edemiyordu.

Iki tablo bunu semaya tasir: her tablonun geometri tipi sabittir, olcusu tektir
(bolgede alan, guzergahta uzunluk) ve dallanma kodda degil tablo secimindedir.

Atama sutunlari (worker_id/assigned_at/tamamlandi_at...) BILINCLI OLARAK her
tabloda tekrarlanir; ortak polymorphic bir `assignments` tablosu kurulmaz.
Kota ("Gorev Tek Kavramdir") uygulama katmaninda iki tablonun toplamiyla
korunur - semaya tasindiginda her okumaya bir JOIN ekliyordu.

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Iki tablonun paylastigi sutunlar. Geometri disinda tamamen ayni olduklari
# icin tek yerden uretilir: birinin sutunu digerinden sessizce ayrismasin.
def _ortak_sutunlar() -> list[sa.Column]:
    return [
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("ad", sa.String(120), nullable=False),
        sa.Column("aciklama", sa.Text(), nullable=True),
        sa.Column("renk", sa.String(9), nullable=False, server_default="#059669"),
        sa.Column(
            "departman",
            sa.String(32),
            sa.ForeignKey("departmanlar.kod"),
            nullable=True,
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
        sa.Column("tamamlandi_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "tamamlayan_id",
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
    ]


# Veri tasimada ve geri donuste kullanilan sutun listesi (geometri disinda).
TASINAN = (
    "id, ad, aciklama, renk, departman, worker_id, assigned_at, assigned_by, "
    "tamamlandi_at, tamamlayan_id, created_by, created_at, updated_at"
)


def upgrade() -> None:
    op.create_table(
        "bolgeler",
        *_ortak_sutunlar(),
        sa.Column(
            "geom",
            Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )
    op.create_table(
        "guzergahlar",
        *_ortak_sutunlar(),
        sa.Column(
            "geom",
            Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )

    for tablo in ("bolgeler", "guzergahlar"):
        op.create_index(
            f"idx_{tablo}_geom", tablo, ["geom"], postgresql_using="gist"
        )
        op.create_index(f"idx_{tablo}_worker", tablo, ["worker_id"])
        op.create_index(f"ix_{tablo}_departman", tablo, ["departman"])

    # ST_Multi: eski tabloda alanlar zaten MULTIPOLYGON yazilmisti, ama sutun
    # tipi GEOMETRY oldugu icin tekil POLYGON kalmis satirlar da olabilir -
    # yeni sutun tipi bunlari reddederdi.
    op.execute(
        f"""
        INSERT INTO bolgeler ({TASINAN}, geom)
        SELECT {TASINAN}, ST_Multi(geom)
          FROM gorev_bolgeleri
         WHERE tip = 'alan'
        """
    )
    op.execute(
        f"""
        INSERT INTO guzergahlar ({TASINAN}, geom)
        SELECT {TASINAN}, geom
          FROM gorev_bolgeleri
         WHERE tip = 'cizgi'
        """
    )

    op.drop_index("idx_gorev_bolgeleri_worker", table_name="gorev_bolgeleri")
    op.drop_index("idx_gorev_bolgeleri_geom", table_name="gorev_bolgeleri")
    op.drop_index("ix_gorev_bolgeleri_departman", table_name="gorev_bolgeleri")
    op.drop_table("gorev_bolgeleri")
    postgresql.ENUM(name="bolge_tipi").drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # Veri kaybi yok: iki tablo tek tabloda birlesir, tip sutunu geldigi
    # tablodan yazilir. 0008'deki gibi reddetmek gerekmez.
    bolge_tipi = postgresql.ENUM("alan", "cizgi", name="bolge_tipi", create_type=False)
    bolge_tipi.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "gorev_bolgeleri",
        *_ortak_sutunlar(),
        sa.Column("tip", bolge_tipi, nullable=False),
        sa.Column(
            "geom",
            Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_gorev_bolgeleri_geom",
        "gorev_bolgeleri",
        ["geom"],
        postgresql_using="gist",
    )
    op.create_index("idx_gorev_bolgeleri_worker", "gorev_bolgeleri", ["worker_id"])
    op.create_index("ix_gorev_bolgeleri_departman", "gorev_bolgeleri", ["departman"])

    op.execute(
        f"""
        INSERT INTO gorev_bolgeleri ({TASINAN}, tip, geom)
        SELECT {TASINAN}, 'alan'::bolge_tipi, geom FROM bolgeler
        """
    )
    op.execute(
        f"""
        INSERT INTO gorev_bolgeleri ({TASINAN}, tip, geom)
        SELECT {TASINAN}, 'cizgi'::bolge_tipi, geom FROM guzergahlar
        """
    )

    for tablo in ("guzergahlar", "bolgeler"):
        op.drop_index(f"ix_{tablo}_departman", table_name=tablo)
        op.drop_index(f"idx_{tablo}_worker", table_name=tablo)
        op.drop_index(f"idx_{tablo}_geom", table_name=tablo)
        op.drop_table(tablo)

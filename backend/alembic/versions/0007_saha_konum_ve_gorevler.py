"""saha ekibi konum takibi + gorev (assignment) atama + ornek veri

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-27

"""
from typing import Sequence, Union

import bcrypt
import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _hash(parola: str) -> str:
    return bcrypt.hashpw(parola.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def upgrade() -> None:
    bind = op.get_bind()

    # 1) users: son konum + son gorulme zamani (saha calisani icin).
    op.add_column(
        "users",
        sa.Column(
            "last_location",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 2) assignment_status enum + assignments tablosu.
    assignment_status = postgresql.ENUM(
        "atandi", "tamamlandi", "iptal", name="assignment_status", create_type=False
    )
    assignment_status.create(bind, checkfirst=True)

    op.create_table(
        "assignments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "worker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", assignment_status, nullable=False, server_default="atandi"),
        sa.Column(
            "assigned_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Bir varligin ayni anda tek aktif gorevi olur.
    op.execute(
        "CREATE UNIQUE INDEX uq_assignments_aktif_asset "
        "ON assignments (asset_id) WHERE status = 'atandi'"
    )
    op.create_index("idx_assignments_worker_status", "assignments", ["worker_id", "status"])

    # 3) log_action enum'una yeni degerler (PG16 transaction icinde calisir; ayni
    #    transaction'da KULLANILMAZ - seed dogrudan assignments'a yazar).
    op.execute("ALTER TYPE log_action ADD VALUE IF NOT EXISTS 'assignment_created'")
    op.execute("ALTER TYPE log_action ADD VALUE IF NOT EXISTS 'assignment_completed'")

    # 4) Ornek veri (idempotent: her satir NOT EXISTS ile korunur). Yonlendirme/
    #    kapasite/konum takibi canli test edilebilsin diye tohumlanir.
    _seed(bind)


def _seed(bind) -> None:
    # --- Kullanicilar ---
    saha = [
        ("sahaekibi1@greenasset.com", "Saha Ekibi 1 (Kadıköy)", 29.0275, 40.9902),
        ("sahaekibi2@greenasset.com", "Saha Ekibi 2 (Beşiktaş)", 29.0067, 41.0430),
        ("sahaekibi3@greenasset.com", "Saha Ekibi 3 (Bakırköy)", 28.8720, 40.9805),
    ]
    saha_hash = _hash("saha1234")
    for email, ad, lon, lat in saha:
        bind.execute(
            sa.text(
                """
                INSERT INTO users (email, hashed_password, full_name, role,
                                   last_location, last_seen_at)
                SELECT :email, :hash, :ad, 'saha_calisani',
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), now()
                WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = :email)
                """
            ).bindparams(email=email, hash=saha_hash, ad=ad, lon=lon, lat=lat)
        )

    bind.execute(
        sa.text(
            """
            INSERT INTO users (email, hashed_password, full_name, role)
            SELECT 'calisan1@greenasset.com', :hash, 'Belediye Personeli 1', 'calisan'
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'calisan1@greenasset.com')
            """
        ).bindparams(hash=_hash("calisan1234"))
    )
    bind.execute(
        sa.text(
            """
            INSERT INTO users (email, hashed_password, full_name, role)
            SELECT 'vatandas1@greenasset.com', :hash, 'Örnek Vatandaş', 'vatandas'
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'vatandas1@greenasset.com')
            """
        ).bindparams(hash=_hash("vatandas1234"))
    )

    # --- Bakim bekleyen varliklar (kayitli) ---
    assets = [
        ("Kadıköy Rıhtım Bank 12", "bank", 29.0250, 40.9895),
        ("Kadıköy Moda Aydınlatma D-7", "direk", 29.0300, 40.9870),
        ("Beşiktaş Meydan Çınarı", "agac", 29.0050, 41.0425),
        ("Bakırköy Sahil Bank 3", "bank", 28.8700, 40.9790),
        ("Şişli Aydınlatma D-22", "direk", 28.9870, 41.0600),
        ("Üsküdar Salacak Bank 5", "bank", 29.0130, 41.0250),
    ]
    for ad, tip, lon, lat in assets:
        bind.execute(
            sa.text(
                """
                INSERT INTO assets (name, type, status, source, geometry)
                SELECT :ad, CAST(:tip AS asset_type), 'bakim_lazim', 'kayitli',
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                WHERE NOT EXISTS (
                    SELECT 1 FROM assets WHERE name = :ad AND source = 'kayitli'
                )
                """
            ).bindparams(ad=ad, tip=tip, lon=lon, lat=lat)
        )

    # --- Bekleyen ihbarlar (onaylaninca en yakin ekibe yonlendirilecek) ---
    reports = [
        ("Kadıköy'de kurumuş ağaç", "agac", 29.0240, 40.9880,
         "Ağaç tamamen kurumuş, düşme tehlikesi var."),
        ("Beşiktaş'ta kırık bank", "bank", 29.0080, 41.0440,
         "Bankın oturma tahtası kırılmış."),
        ("Bakırköy'de yanmayan direk", "direk", 28.8740, 40.9810,
         "Sokak lambası geceleri hiç yanmıyor."),
        ("Fatih'te devrilmiş direk", "direk", 28.9500, 41.0180,
         "Aydınlatma direği yana yatmış, kaldırımı kapatıyor."),
    ]
    for ad, tip, lon, lat, note in reports:
        bind.execute(
            sa.text(
                """
                INSERT INTO reports (reporter_id, name, type, note, geometry)
                SELECT (SELECT id FROM users WHERE email = 'vatandas1@greenasset.com'),
                       :ad, CAST(:tip AS asset_type), :note,
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                WHERE NOT EXISTS (SELECT 1 FROM reports WHERE name = :ad)
                  AND EXISTS (SELECT 1 FROM users WHERE email = 'vatandas1@greenasset.com')
                """
            ).bindparams(ad=ad, tip=tip, note=note, lon=lon, lat=lat)
        )

    # --- Ornek atamalar (sahaekibi1'e 2, sahaekibi2'ye 1 aktif gorev) ---
    atamalar = [
        ("Kadıköy Rıhtım Bank 12", "sahaekibi1@greenasset.com"),
        ("Kadıköy Moda Aydınlatma D-7", "sahaekibi1@greenasset.com"),
        ("Beşiktaş Meydan Çınarı", "sahaekibi2@greenasset.com"),
    ]
    for asset_ad, worker_email in atamalar:
        bind.execute(
            sa.text(
                """
                INSERT INTO assignments (asset_id, worker_id, status)
                SELECT ast.id, u.id, 'atandi'
                FROM assets ast, users u
                WHERE ast.name = :asset_ad AND ast.source = 'kayitli'
                  AND u.email = :worker_email
                  AND NOT EXISTS (
                      SELECT 1 FROM assignments a
                      WHERE a.asset_id = ast.id AND a.status = 'atandi'
                  )
                LIMIT 1
                """
            ).bindparams(asset_ad=asset_ad, worker_email=worker_email)
        )


def downgrade() -> None:
    op.drop_index("idx_assignments_worker_status", table_name="assignments")
    op.execute("DROP INDEX IF EXISTS uq_assignments_aktif_asset")
    op.drop_table("assignments")
    postgresql.ENUM(name="assignment_status").drop(op.get_bind(), checkfirst=True)
    op.drop_column("users", "last_seen_at")
    op.drop_column("users", "last_location")
    # Not: log_action enum'una eklenen degerler Postgres'te geri alinamaz; birakilir.

"""haber ver+ baslangic semasi (tek baseline)

Bu dosya, projenin ilk 12 migration'inin (0001-0012) squash edilmis halidir.
Proje henuz hicbir ortama deploy edilmemisti, dolayisiyla gecmis adimlari
korumaya gerek yoktu: ara duzeltmeler ('bank' turunun eklenip sonra
kaldirilmasi, rol/enum degerlerinin sonradan eklenmesi, kolonlarin sonradan
ALTER ile takilmasi) tarihce olarak degil, dogrudan nihai sema olarak yazildi.

BU DOSYA YALNIZCA SEMA + CALISMA VERISI icerir. Ornek/demo veri (saha ekipleri,
ornek varlik ve ihbarlar) bilincli olarak migration zincirinin DISINDA,
backend/scripts/seed_demo.py'de durur - boylece canliya asla gitmez.

Icerdigi calisma verisi:
  * yakalar tablosunun dolumu (Istanbul'un 39 ilcesi -> 3 yaka). Bu demo veri
    DEGIL: otomatik gorev atamasindaki yaka kisiti buna dayanir, tablo bossa
    kisit sessizce devre disi kalir. Kaynak repodaki app/data/sinirlar/ilce/
    dosyalari (OSM/ODbL) - migration disaridan veri cekmez.
  * Ilk admin hesabi (DEFAULT_ADMIN_EMAIL/DEFAULT_ADMIN_PASSWORD ortam
    degiskenlerinden). Sisteme ilk girisi mumkun kilar; uretimde bu env'ler
    mutlaka gercek degerlerle verilmelidir.

Revision ID: 0001
Revises:
Create Date: 2026-07-28

"""
import json
import os
from pathlib import Path
from typing import Sequence, Union

import bcrypt
import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ILCE_DIZINI = Path(__file__).parents[2] / "app" / "data" / "sinirlar" / "ilce"

# Istanbul'un 39 ilcesinin yaka dagilimi. Adalar bilincli olarak ayri bir yaka:
# karadan hic ulasilamaz (vapur), dolayisiyla Anadolu yakasindaki bir ekibe
# otomatik atanmamalidir.
YAKA_ILCELERI: dict[str, tuple[str, list[str]]] = {
    "avrupa": (
        "Avrupa Yakası",
        [
            "34002",  # Arnavutköy
            "34004",  # Avcılar
            "34005",  # Bağcılar
            "34006",  # Bahçelievler
            "34007",  # Bakırköy
            "34008",  # Başakşehir
            "34009",  # Bayrampaşa
            "34010",  # Beşiktaş
            "34012",  # Beylikdüzü
            "34013",  # Beyoğlu
            "34014",  # Büyükçekmece
            "34015",  # Çatalca
            "34017",  # Esenler
            "34018",  # Esenyurt
            "34019",  # Eyüpsultan
            "34020",  # Fatih
            "34021",  # Gaziosmanpaşa
            "34022",  # Güngören
            "34024",  # Kağıthane
            "34026",  # Küçükçekmece
            "34030",  # Sarıyer
            "34031",  # Silivri
            "34033",  # Sultangazi
            "34035",  # Şişli
            "34039",  # Zeytinburnu
        ],
    ),
    "anadolu": (
        "Anadolu Yakası",
        [
            "34003",  # Ataşehir
            "34011",  # Beykoz
            "34016",  # Çekmeköy
            "34023",  # Kadıköy
            "34025",  # Kartal
            "34027",  # Maltepe
            "34028",  # Pendik
            "34029",  # Sancaktepe
            "34032",  # Sultanbeyli
            "34034",  # Şile
            "34036",  # Tuzla
            "34037",  # Ümraniye
            "34038",  # Üsküdar
        ],
    ),
    "ada": ("Adalar", ["34001"]),
}


def _ilce_geojson(kod: str) -> str:
    """Bir ilce sinir dosyasini GeoJSON MultiPolygon'a cevirir.

    'noktalar' her zaman bir halka listesidir; her halka ayri bir kara parcasidir
    (Adalar 9, Şile 12 halka). Halkalar dosyada kapali degil, GeoJSON kapali
    olmalarini sart kostugu icin ilk nokta sona eklenir."""
    veri = json.loads((ILCE_DIZINI / f"{kod}.json").read_text(encoding="utf-8"))
    parcalar = []
    for halka in veri["noktalar"]:
        if halka[0] != halka[-1]:
            halka = [*halka, halka[0]]
        parcalar.append([halka])
    return json.dumps({"type": "MultiPolygon", "coordinates": parcalar})


def _yakalari_doldur(bind) -> None:
    """Ilce poligonlarini yaka bazinda birlestirip 'yakalar' tablosuna yazar.

    Ilceler ONCE TEK TEK gecerli hale getirilir, SONRA birlestirilir. Tersi
    (hepsini tek MultiPolygon yapip sonra ST_MakeValid) alan kaybina yol aciyor:
    OSM'den sadelestirilmis bazi ilce halkalari kendini kesiyor (or. Beykoz) ve
    toplu MakeValid komsu ilcelerin parcalarini da dusurebiliyor."""
    bind.execute(sa.text("CREATE TEMP TABLE _yaka_ilce (yaka text, g geometry)"))
    for kod, (_, ilce_kodlari) in YAKA_ILCELERI.items():
        for ilce_kodu in ilce_kodlari:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO _yaka_ilce (yaka, g)
                    VALUES (
                        :yaka,
                        -- ST_MakeValid, kendini kesen halkalarda poligon + serbest
                        -- cizgi iceren bir GeometryCollection dondurebilir;
                        -- ST_CollectionExtract(...,3) yalnizca poligonlari alir.
                        ST_CollectionExtract(
                            ST_MakeValid(
                                ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)
                            ),
                            3
                        )
                    )
                    """
                ),
                {"yaka": kod, "geojson": _ilce_geojson(ilce_kodu)},
            )

    for kod, (ad, _) in YAKA_ILCELERI.items():
        bind.execute(
            sa.text(
                """
                -- :kod hem SELECT hem WHERE'de gectigi icin acikca cast edilir
                -- (aksi halde Postgres tipini cikaramiyor: AmbiguousParameter).
                INSERT INTO yakalar (kod, ad, geom)
                SELECT CAST(:kod AS text), CAST(:ad AS text),
                       ST_Multi(ST_UnaryUnion(ST_Collect(g)))
                FROM _yaka_ilce WHERE yaka = CAST(:kod AS text)
                """
            ),
            {"kod": kod, "ad": ad},
        )
    bind.execute(sa.text("DROP TABLE _yaka_ilce"))


def upgrade() -> None:
    bind = op.get_bind()

    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # --- Enum tipleri -------------------------------------------------------
    # create_type=False: tipler burada acikca olusturulur, create_table tekrar
    # denemesin.
    asset_type = postgresql.ENUM(
        "agac", "direk", "sulama", name="asset_type", create_type=False
    )
    asset_status = postgresql.ENUM(
        "iyi", "bakim_lazim", name="asset_status", create_type=False
    )
    asset_source = postgresql.ENUM(
        "kayitli", "ihbar", name="asset_source", create_type=False
    )
    user_role = postgresql.ENUM(
        "admin", "calisan", "vatandas", "saha_calisani",
        name="user_role", create_type=False,
    )
    report_status = postgresql.ENUM(
        "beklemede", "onaylandi", "reddedildi",
        name="report_status", create_type=False,
    )
    assignment_status = postgresql.ENUM(
        "atandi", "tamamlandi", "iptal",
        name="assignment_status", create_type=False,
    )
    log_action = postgresql.ENUM(
        "asset_created",
        "asset_updated",
        "asset_status_changed",
        "asset_deleted",
        "report_approved",
        "report_rejected",
        "user_created",
        "assignment_created",
        "assignment_completed",
        "assignment_cancelled",
        "user_updated",
        name="log_action",
        create_type=False,
    )
    for enum in (
        asset_type, asset_status, asset_source, user_role,
        report_status, assignment_status, log_action,
    ):
        enum.create(bind, checkfirst=True)

    # --- yakalar (calisma verisi; users.yaka buna FK ile bagli) --------------
    op.create_table(
        "yakalar",
        sa.Column("kod", sa.String(16), primary_key=True),
        sa.Column("ad", sa.String(64), nullable=False),
        sa.Column(
            "geom",
            Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )
    op.create_index("idx_yakalar_geom", "yakalar", ["geom"], postgresql_using="gist")

    # --- users --------------------------------------------------------------
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
        # Saha calisani (ekip) icin son bilinen konum + zamani; diger rollerde NULL.
        sa.Column(
            "last_location",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        # Saha ekibinin kadro yakasi; NULL ise yaka son konumdan turetilir.
        sa.Column("yaka", sa.String(16), sa.ForeignKey("yakalar.kod"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- assets -------------------------------------------------------------
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
        sa.Column("source", asset_source, nullable=False, server_default="kayitli"),
        sa.Column(
            "geometry",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("install_date", sa.Date(), nullable=True),
        sa.Column("brand_model", sa.String(255), nullable=True),
        sa.Column("photo_url", sa.String(512), nullable=True),
        # Varlik "Tamir Edildi" olarak isaretlendiginde dolar; durum tekrar
        # 'bakim_lazim'a donerse temizlenir.
        sa.Column("repaired_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("idx_assets_geometry", "assets", ["geometry"], postgresql_using="gist")

    # --- reports ------------------------------------------------------------
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
        sa.Column("status", report_status, nullable=False, server_default="beklemede"),
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
    op.create_index("idx_reports_geometry", "reports", ["geometry"], postgresql_using="gist")

    # --- activity_logs (audit log) ------------------------------------------
    op.create_table(
        "activity_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("action", log_action, nullable=False),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_name", sa.String(255), nullable=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_name", sa.String(255), nullable=True),
        sa.Column("detail", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_activity_logs_created_at", "activity_logs", ["created_at"])

    # --- assignments (gorev atamalari) --------------------------------------
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
        # NULL ise otomatik atama, doluysa elle atayan personel.
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
    op.create_index(
        "idx_assignments_worker_status", "assignments", ["worker_id", "status"]
    )

    # --- Calisma verisi -----------------------------------------------------
    _yakalari_doldur(bind)

    # Ilk admin (yalnizca hic admin yoksa). Uretimde bu env'ler mutlaka
    # gercek degerlerle verilmelidir - varsayilanlar yalnizca gelistirme icin.
    email = os.environ.get("DEFAULT_ADMIN_EMAIL", "admin@haberver.com").lower()
    parola = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin1234")
    hashed = bcrypt.hashpw(parola.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    bind.execute(
        sa.text(
            """
            INSERT INTO users (email, hashed_password, full_name, role)
            SELECT :email, :hashed, 'Sistem Yoneticisi', 'admin'
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
            """
        ).bindparams(email=email, hashed=hashed)
    )


def downgrade() -> None:
    op.drop_table("assignments")
    op.drop_table("activity_logs")
    op.drop_table("reports")
    op.drop_table("assets")
    op.drop_table("users")
    op.drop_table("yakalar")
    for ad in (
        "log_action",
        "assignment_status",
        "report_status",
        "user_role",
        "asset_source",
        "asset_status",
        "asset_type",
    ):
        postgresql.ENUM(name=ad).drop(op.get_bind(), checkfirst=True)

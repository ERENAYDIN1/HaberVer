"""yaka (kita) alanlari + users.yaka: otomatik atamada Bogaz'i gecmeyi engelle

Istanbul'un 39 ilcesi 3 yakaya ayrilir (avrupa / anadolu / ada) ve her yaka,
o yakadaki ilce poligonlarinin ST_UnaryUnion ile birlestirilmis hali olarak
'yakalar' tablosuna yazilir. Kaynak: app/data/sinirlar/ilce/34*.json (OSM/ODbL,
bkz. KAYNAK.md) - migration disaridan veri cekmez, repodaki dosyalari okur.

users.yaka: bir saha ekibinin kadro olarak bagli oldugu yaka (NULL ise son
konumundan turetilir). Mevcut saha ekipleri icin son konumlarindan tohumlanir.

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-28

"""
import json
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision: str = "0011"
down_revision: Union[str, None] = "0010"
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


def upgrade() -> None:
    bind = op.get_bind()

    # Admin bir ekibin yakasini degistirdiginde audit log'a yazilacak yeni deger.
    # (Yeni enum degeri ayni transaction icinde KULLANILMADIGI surece sorunsuz.)
    op.execute("ALTER TYPE log_action ADD VALUE IF NOT EXISTS 'user_updated'")

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
    op.create_index(
        "idx_yakalar_geom", "yakalar", ["geom"], postgresql_using="gist"
    )

    # Ilceler once TEK TEK gecerli hale getirilir, sonra yaka bazinda birlestirilir.
    # Tersi (once hepsini tek MultiPolygon yapip sonra ST_MakeValid) alan kaybina
    # yol aciyor: OSM'den sadelestirilmis bazi ilce halkalari kendini kesiyor
    # (or. Beykoz) ve toplu MakeValid komsu ilcelerin parcalarini da dusurebiliyor.
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
                INSERT INTO yakalar (kod, ad, geom)
                -- :kod hem SELECT hem WHERE'de gectigi icin acikca cast edilir
                -- (aksi halde Postgres tipini cikaramiyor: AmbiguousParameter).
                SELECT CAST(:kod AS text), CAST(:ad AS text),
                       ST_Multi(ST_UnaryUnion(ST_Collect(g)))
                FROM _yaka_ilce WHERE yaka = CAST(:kod AS text)
                """
            ),
            {"kod": kod, "ad": ad},
        )
    bind.execute(sa.text("DROP TABLE _yaka_ilce"))

    op.add_column(
        "users",
        sa.Column(
            "yaka",
            sa.String(16),
            sa.ForeignKey("yakalar.kod"),
            nullable=True,
        ),
    )

    # Mevcut saha ekiplerini son bilinen konumlarindan tohumla; konumu olmayan
    # ekipler NULL kalir (ilk konum bildiriminden sonra konumdan turetilir).
    bind.execute(
        sa.text(
            """
            UPDATE users u
            SET yaka = (
                SELECT y.kod FROM yakalar y
                ORDER BY y.geom <-> u.last_location
                LIMIT 1
            )
            WHERE u.role = 'saha_calisani' AND u.last_location IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_column("users", "yaka")
    op.drop_table("yakalar")

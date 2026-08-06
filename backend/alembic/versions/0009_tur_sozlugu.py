"""Tur sozlugu veriye tasindi: `asset_type` enum'u -> `turler` tablosu

Neden: admin yeni bir tur eklemek istediginde ("kamera", "yangin muslugu")
bugun elinde iki yol vardi - migration yazmak ya da veritabanina elle
`ALTER TYPE` cekmek. Ikisi de arayuzden yapilamaz. PostgreSQL enum'undan deger
SILINEMEDIGI icin yanlis eklenen bir tur de kalicidir.

Cozum, `departmanlar`/`yakalar` ile ayni desen: sozluk bir TABLODUR.
`turler.kod` dogal anahtardir; `assets.type`, `reports.type` ve
`tur_departman.tur` artik varchar + FK ile ona baglanir. Boylece:
  * yeni tur eklemek bir INSERT,
  * kullanilmayan bir turu silmek bir DELETE (kullaniliyorsa FK engeller),
  * turun adi/grubu/glifi duzeltilebilir bir veri satiri olur.

Renk buraya YAZILMAZ: tur rengi grubundan gelir (frontend GRUP_RENGI) - iki
renk kaynagi olusmasin diye yalnizca `grup` saklanir. `glif` de bir anahtardir,
SVG'nin kendisi frontend'deki glif kitapliginda durur.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Turun ait oldugu gorsel grup. 13 tur icin 13 ayirt edilebilir renk
# olmadigindan renk gruba, glif ture aittir (bkz. CLAUDE.md "Isaretci Gorsel
# Dili"). Grup kumesi frontend'in renk paletiyle birebir oldugu icin CHECK ile
# sabitlenir: veritabanina yazilan bir yazim hatasi haritada sessizce gri bir
# isaretciye donusmesin.
GRUPLAR = ("yesil", "aydinlatma", "yol", "altyapi", "diger")

# kod, ad, grup, glif, envanter
#
# `envanter` = personelin "Ekle" formundan elle girebilecegi tur mu. `diger`
# yalnizca bir talep kategorisidir: envantere "Diğer" diye bir kayit acilmaz.
TURLER = [
    ("agac", "Ağaç", "yesil", "agac", True),
    ("sulama", "Sulama", "yesil", "sulama", True),
    ("oyun_grubu", "Oyun Grubu", "yesil", "oyun_grubu", True),
    ("bank", "Bank", "yesil", "bank", True),
    ("cop_kutusu", "Çöp Kutusu", "yesil", "cop_kutusu", True),
    ("direk", "Aydınlatma Direği", "aydinlatma", "direk", True),
    ("elektrik_panosu", "Elektrik Panosu", "aydinlatma", "elektrik_panosu", True),
    ("yol", "Yol / Asfalt", "yol", "yol", True),
    ("kaldirim", "Kaldırım", "yol", "kaldirim", True),
    ("rogar", "Rögar Kapağı", "yol", "rogar", True),
    ("trafik_levhasi", "Trafik Levhası", "yol", "trafik_levhasi", True),
    ("su_hatti", "Su Hattı", "altyapi", "su_hatti", True),
    ("diger", "Diğer", "diger", "diger", False),
]

# Enum'a geri donulurken (downgrade) yazilacak deger listesi.
ENUM_DEGERLERI = [kod for kod, *_ in TURLER]

# tip -> (tablo, sutun): enum'dan varchar'a cevrilecek her yer.
SUTUNLAR = [("assets", "type"), ("reports", "type"), ("tur_departman", "tur")]


def upgrade() -> None:
    op.create_table(
        "turler",
        sa.Column("kod", sa.String(32), primary_key=True),
        sa.Column("ad", sa.String(120), nullable=False),
        sa.Column("grup", sa.String(32), nullable=False),
        # Haritadaki/listedeki cizgi glifinin anahtari. NULL ise frontend
        # grubun genel glifine duser - yeni bir tur eklemek SVG yazmayi
        # gerektirmesin diye glif kitapligindan SECILIR, uretilmez.
        sa.Column("glif", sa.String(32), nullable=True),
        sa.Column(
            "envanter", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("sira", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("aktif", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "grup IN ('" + "', '".join(GRUPLAR) + "')", name="ck_turler_grup"
        ),
    )

    baglanti = op.get_bind()
    for sira, (kod, ad, grup, glif, envanter) in enumerate(TURLER):
        baglanti.execute(
            sa.text(
                "INSERT INTO turler (kod, ad, grup, glif, envanter, sira)"
                " VALUES (:kod, :ad, :grup, :glif, :envanter, :sira)"
            ),
            {
                "kod": kod,
                "ad": ad,
                "grup": grup,
                "glif": glif,
                "envanter": envanter,
                "sira": sira * 10,
            },
        )

    # Enum -> varchar. Veri aynen kalir (enum degerleri zaten `turler.kod`).
    for tablo, sutun in SUTUNLAR:
        op.execute(
            f"ALTER TABLE {tablo} ALTER COLUMN {sutun} TYPE varchar(32)"
            f" USING {sutun}::text"
        )

    # FK'ler kismen farkli davranir:
    #   * assets/reports -> RESTRICT: kullanilan bir tur silinemez. Silme
    #     kapisi zaten API'de kapali, ama kural veritabaninda da dursun.
    #   * tur_departman -> CASCADE: yonlendirme turun bir OZELLIGIDIR, tur
    #     gidince pesinden gitmeli; yoksa silme her seferinde iki adim olurdu.
    for tablo, sutun in (("assets", "type"), ("reports", "type")):
        op.create_foreign_key(
            f"fk_{tablo}_{sutun}_turler",
            tablo,
            "turler",
            [sutun],
            ["kod"],
            ondelete="RESTRICT",
        )
    op.create_foreign_key(
        "fk_tur_departman_tur_turler",
        "tur_departman",
        "turler",
        ["tur"],
        ["kod"],
        ondelete="CASCADE",
    )

    op.execute("DROP TYPE asset_type")

    for deger in (
        "tur_created",
        "tur_updated",
        "tur_deleted",
        "departman_created",
        "departman_updated",
        "departman_deleted",
    ):
        op.execute(f"ALTER TYPE log_action ADD VALUE IF NOT EXISTS '{deger}'")


def downgrade() -> None:
    """Sozluk tekrar enum'a daraltilir.

    Enum yalnizca 0009 oncesindeki 13 degeri tanir; arayuzden eklenmis bir tur
    varsa geri donus o satirlari kaybettirirdi. 0008 ile ayni tavir: sessizce
    kirpmak yerine kac kaydin etkilenecegini soyleyip hata verir."""
    baglanti = op.get_bind()
    fazla = baglanti.execute(
        sa.text("SELECT kod FROM turler WHERE kod <> ALL(:kodlar) ORDER BY kod"),
        {"kodlar": ENUM_DEGERLERI},
    ).scalars().all()
    if fazla:
        raise RuntimeError(
            "0009 geri alinamaz: enum'da karsiligi olmayan tur(ler) var -> "
            + ", ".join(fazla)
            + ". Once bu turleri (ve onlari kullanan kayitlari) kaldirin."
        )

    op.drop_constraint("fk_tur_departman_tur_turler", "tur_departman", type_="foreignkey")
    op.drop_constraint("fk_reports_type_turler", "reports", type_="foreignkey")
    op.drop_constraint("fk_assets_type_turler", "assets", type_="foreignkey")

    degerler = "', '".join(ENUM_DEGERLERI)
    op.execute(f"CREATE TYPE asset_type AS ENUM ('{degerler}')")
    for tablo, sutun in SUTUNLAR:
        op.execute(
            f"ALTER TABLE {tablo} ALTER COLUMN {sutun} TYPE asset_type"
            f" USING {sutun}::asset_type"
        )

    op.drop_table("turler")
    # log_action'dan deger dusurulmez: PostgreSQL enum'dan eleman silmeyi
    # desteklemez (0005/0007 ile ayni durum).

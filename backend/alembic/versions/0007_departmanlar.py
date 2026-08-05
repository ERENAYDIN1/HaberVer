"""Departmanlar (mudurlukler) ve tur -> departman yonlendirmesi

Uc yapisal degisiklik:

1. `departmanlar` - 7 mudurluk. Satirlar burada yazilir cunku departman
   kisiti (personelin gorebilecegi tur kumesi, otomatik atamanin ekip secimi)
   BU VERIYE dayanir; tablo bossa kisit sessizce kaybolur. `yakalar` ile ayni
   gerekce - demo veri degil, calisma verisidir.
2. `tur_departman` - 13 turun her biri tam bir departmana baglanir. Tur
   sozlugunun kendisi (`asset_type` enum'u) degismez; degisen yalnizca
   YONLENDIRMEDIR ve admin panelinden guncellenebilir.
3. `users.departman` - personelin bagli oldugu mudurluk.

Mevcut personele varsayilan departman: yukseltmeden sonra departmani NULL
kalan bir `calisan` HICBIR SEY goremez (kapsam bos kume). Bu, calisan bir
kurulumu sessizce bos ekrana dusururdu; bu yuzden mevcut personel/saha
hesaplari `cozum_merkezi`ne atanir. Admin daha sonra dogru mudurluge ceker.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# kod, ad, aciklama, renk
DEPARTMANLAR = [
    (
        "park_bahceler",
        "Park ve Bahçeler Müdürlüğü",
        "Yeşil alanlar, park mobilyaları ve sulama tesisatı.",
        "#059669",
    ),
    (
        "temizlik_isleri",
        "Temizlik İşleri Müdürlüğü",
        "Çöp kutuları ve kent temizliği.",
        "#65a30d",
    ),
    (
        "fen_isleri",
        "Fen İşleri Müdürlüğü",
        "Yol ve kaldırım yapım/onarım işleri.",
        "#f97316",
    ),
    (
        "ulasim_hizmetleri",
        "Ulaşım Hizmetleri Müdürlüğü",
        "Trafik işaretlemesi ve levhalar.",
        "#ca8a04",
    ),
    (
        "aydinlatma_enerji",
        "Aydınlatma ve Enerji Müdürlüğü",
        "Aydınlatma direkleri ve elektrik panoları.",
        "#0284c7",
    ),
    (
        "su_kanalizasyon",
        "Su ve Kanalizasyon Müdürlüğü",
        "Su hatları ve rögar kapakları.",
        "#0891b2",
    ),
    (
        "cozum_merkezi",
        "Çözüm Merkezi (Beyaz Masa)",
        "Sınıflandırılamayan talepler; doğru türe çekilip ilgili müdürlüğe aktarılır.",
        "#64748b",
    ),
]

# tur -> departman_kod. Her turun TAM BIR departmani vardir.
#
# Iki secim aciklama ister:
#   - `rogar` Fen Isleri'nde degil Su ve Kanalizasyon'da: kirik rogar kapagi
#     kanalizasyon idaresinin isidir, yol kaplamasinin degil.
#   - `cop_kutusu` park grubunda gorunse de Temizlik Isleri'nde: sahada cop
#     kutusunu temizlik ekibi degistirir.
TUR_DEPARTMAN = [
    ("agac", "park_bahceler"),
    ("sulama", "park_bahceler"),
    ("oyun_grubu", "park_bahceler"),
    ("bank", "park_bahceler"),
    ("cop_kutusu", "temizlik_isleri"),
    ("direk", "aydinlatma_enerji"),
    ("elektrik_panosu", "aydinlatma_enerji"),
    ("yol", "fen_isleri"),
    ("kaldirim", "fen_isleri"),
    ("rogar", "su_kanalizasyon"),
    ("su_hatti", "su_kanalizasyon"),
    ("trafik_levhasi", "ulasim_hizmetleri"),
    ("diger", "cozum_merkezi"),
]

# Departmansiz kalan mevcut personelin dusecegi mudurluk.
VARSAYILAN_DEPARTMAN = "cozum_merkezi"


def upgrade() -> None:
    op.create_table(
        "departmanlar",
        sa.Column("kod", sa.String(32), primary_key=True),
        sa.Column("ad", sa.String(120), nullable=False),
        sa.Column("aciklama", sa.Text(), nullable=True),
        sa.Column("renk", sa.String(9), nullable=False),
        sa.Column("aktif", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "tur_departman",
        # create_type=False: `asset_type` enum'u 0001'de zaten olusturuldu
        # (0005'te genisletildi); burada yalnizca referans veriliyor.
        sa.Column(
            "tur",
            postgresql.ENUM(name="asset_type", create_type=False),
            primary_key=True,
        ),
        sa.Column(
            "departman_kod",
            sa.String(32),
            sa.ForeignKey("departmanlar.kod", ondelete="RESTRICT"),
            nullable=False,
        ),
    )

    baglanti = op.get_bind()
    for kod, ad, aciklama, renk in DEPARTMANLAR:
        baglanti.execute(
            sa.text(
                "INSERT INTO departmanlar (kod, ad, aciklama, renk)"
                " VALUES (:kod, :ad, :aciklama, :renk)"
            ),
            {"kod": kod, "ad": ad, "aciklama": aciklama, "renk": renk},
        )
    for tur, departman in TUR_DEPARTMAN:
        # Bound param enum sutununa CAST ile verilir; `:tur::asset_type`
        # sozdizimi SQLAlchemy'nin bind param'iyla cakisir.
        baglanti.execute(
            sa.text(
                "INSERT INTO tur_departman (tur, departman_kod)"
                " VALUES (CAST(:tur AS asset_type), :departman)"
            ),
            {"tur": tur, "departman": departman},
        )

    op.add_column(
        "users",
        sa.Column(
            "departman",
            sa.String(32),
            sa.ForeignKey("departmanlar.kod"),
            nullable=True,
        ),
    )
    # Departmani olmayan bir personel hicbir turu goremez; mevcut kurulumlar
    # yukseltmeden sonra bos ekrana dusmesin diye triyaj mudurlugune atanirlar.
    baglanti.execute(
        sa.text(
            "UPDATE users SET departman = :varsayilan"
            " WHERE role IN ('calisan', 'saha_calisani') AND departman IS NULL"
        ),
        {"varsayilan": VARSAYILAN_DEPARTMAN},
    )
    # Otomatik atama ekipleri departmana gore suzuyor.
    op.create_index("ix_users_departman", "users", ["departman"])

    # Log satirinin departmani KAYIT ANINDA yazilir, sonradan varlik/talep
    # uzerinden turetilmez: audit log'un en degerli satirlari silme kayitlaridir
    # ve entity silindikten sonra turu ogrenilemez. NULL = departmana ozel
    # olmayan islem (bolge, kullanici, oturum) - tum personel gorur.
    op.add_column(
        "activity_logs",
        sa.Column(
            "departman",
            sa.String(32),
            sa.ForeignKey("departmanlar.kod"),
            nullable=True,
        ),
    )
    op.create_index("ix_activity_logs_departman", "activity_logs", ["departman"])
    # Mevcut varlik/talep kayitlarini geriye donuk doldur (entity hala duruyorsa).
    for tablo, entity in (("assets", "asset"), ("reports", "report")):
        baglanti.execute(
            sa.text(
                f"""
                UPDATE activity_logs l
                   SET departman = td.departman_kod
                  FROM {tablo} e
                  JOIN tur_departman td ON td.tur = e.type
                 WHERE l.entity_type = :entity AND l.entity_id = e.id
                """
            ),
            {"entity": entity},
        )

    op.execute("ALTER TYPE log_action ADD VALUE IF NOT EXISTS 'tur_departman_changed'")


def downgrade() -> None:
    op.drop_index("ix_activity_logs_departman", table_name="activity_logs")
    op.drop_column("activity_logs", "departman")
    op.drop_index("ix_users_departman", table_name="users")
    op.drop_column("users", "departman")
    op.drop_table("tur_departman")
    op.drop_table("departmanlar")
    # log_action'dan deger dusurulmez: PostgreSQL enum'dan eleman silmeyi
    # desteklemez (0005'teki tur eklemeleriyle ayni durum).

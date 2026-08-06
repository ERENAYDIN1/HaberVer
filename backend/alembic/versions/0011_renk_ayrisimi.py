"""Renk ayrisimi: grup paleti, mudurluk paleti ve mudurluk sirasi

Lejantta varlik turleri artik mudurluk mudurluk listeleniyor; baslik
mudurlugun rengini, tur satiri ise haritada gercekten basilan GRUP rengini
tasiyor. Ikisi tek panelde yan yana gelince paletlerin birbirine cok yakin
dustugu uc yer ortaya cikti:

1. `aydinlatma` (#0284c7) ile `altyapi` (#0891b2) GRUP renkleri 8 derece hue
   farkiyla neredeyse ayni maviydi - bir aydinlatma diregi ile su hatti
   isaretcisi HARITADA da ayirt edilemiyordu. Lejant bunu gorunur kildi ama
   sorun lejantta degil paletteydi. `aydinlatma` indigoya cekildi; su/altyapi
   camgobegi kalir (su icin dogal olan renk odur).
2. `temizlik_isleri` (#65a30d) park/bahcelerin zumrut yesiline,
   `ulasim_hizmetleri` (#ca8a04) fen isilerinin turuncusuna ve "bakim lazim"
   amberine cok yakindi. Ikisi de kendi turlerinin grup rengiyle zaten
   ortusemiyor (bkz. asagidaki rogar notu), bu yuzden paletin bos bolgelerine
   tasindilar.
3. `rogar` gorsel olarak `yol` grubundaydi ama Su ve Kanalizasyon'a gidiyor:
   lejantta camgobegi bir baslik altinda turuncu bir satir duruyordu. Rogar
   kapagi zaten yol degil ALTYAPI isidir - grup duzeltildi ve satir kendi
   mudurlugunun rengine oturdu.

Renkler VERIDIR (admin degistirebilir): guncellemeler yalnizca satir HALA
0007'nin yazdigi degerdeyse uygulanir, elle degistirilmis renkler korunur.

Ayrica `departmanlar.sira` eklendi. Liste `ORDER BY ad` ile alfabetikti ve
"Cozum Merkezi (Beyaz Masa)" - sistemin triyaj kovasi - lejantin ikinci
sirasina dusuyordu. Bir "diger" kovasi her zaman en altta durmali; sira
`turler.sira` ile ayni desendedir.

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# kod, eski renk, yeni renk. Eski renk WHERE'de kullanilir: admin renkleri
# degistirmisse migration onlarin uzerine yazmaz.
RENKLER = [
    # Grup paletiyle birlikte tasindi (asagidaki GRUP_RENGI degisikligi).
    ("aydinlatma_enerji", "#0284c7", "#4338ca"),
    # Zumrut yesiline cok yakindi; koyu zeytin tonuna cekildi.
    ("temizlik_isleri", "#65a30d", "#4d7c0f"),
    # Turuncu (fen isleri) ve amber (bakim lazim) ile ayni bolgedeydi.
    ("ulasim_hizmetleri", "#ca8a04", "#be185d"),
]

# kod, sira. Cozum Merkezi bilincli olarak buyuk bir deger alir: yeni acilan
# mudurlukler varsayilan 100 ile onun ONUNE girer, triyaj kovasi altta kalir.
SIRALAR = [
    ("park_bahceler", 10),
    ("temizlik_isleri", 20),
    ("fen_isleri", 30),
    ("ulasim_hizmetleri", 40),
    ("aydinlatma_enerji", 50),
    ("su_kanalizasyon", 60),
    ("cozum_merkezi", 900),
]


def upgrade() -> None:
    baglanti = op.get_bind()

    op.add_column(
        "departmanlar",
        sa.Column("sira", sa.Integer(), nullable=False, server_default="100"),
    )
    for kod, sira in SIRALAR:
        baglanti.execute(
            sa.text("UPDATE departmanlar SET sira = :sira WHERE kod = :kod"),
            {"kod": kod, "sira": sira},
        )

    for kod, eski, yeni in RENKLER:
        baglanti.execute(
            sa.text(
                "UPDATE departmanlar SET renk = :yeni"
                " WHERE kod = :kod AND renk = :eski"
            ),
            {"kod": kod, "eski": eski, "yeni": yeni},
        )

    # Rogar: gorsel grup yol -> altyapi. Yalnizca 0009'un yazdigi deger hala
    # duruyorsa; admin turu baska bir gruba almissa karisilmaz.
    baglanti.execute(
        sa.text(
            "UPDATE turler SET grup = 'altyapi'"
            " WHERE kod = 'rogar' AND grup = 'yol'"
        )
    )


def downgrade() -> None:
    baglanti = op.get_bind()

    baglanti.execute(
        sa.text(
            "UPDATE turler SET grup = 'yol'"
            " WHERE kod = 'rogar' AND grup = 'altyapi'"
        )
    )
    for kod, eski, yeni in RENKLER:
        baglanti.execute(
            sa.text(
                "UPDATE departmanlar SET renk = :eski"
                " WHERE kod = :kod AND renk = :yeni"
            ),
            {"kod": kod, "eski": eski, "yeni": yeni},
        )
    op.drop_column("departmanlar", "sira")

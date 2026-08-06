"""Grup rengi ile mudurluk rengini ortusturen iki yeni grup: `ulasim`, `temizlik`

Lejantta turler mudurluk mudurluk listeleniyor: baslik mudurlugun rozet
rengini, tur satirinin swatch'i ise haritada gercekten basilan GRUP rengini
tasir. 0011'den sonra 13 turun 11'inde bu iki renk zaten birebir ayniydi; geriye
iki tur kaldi ve ikisi de baska bir mudurlugun rengiyle ciziliyordu:

  - `trafik_levhasi` -> `yol` grubu (#f97316), oysa is Ulasim Hizmetleri'ne
    gider; haritada Fen Isleri'nin asfalt/kaldirim isaretcileriyle ayni renkti.
  - `cop_kutusu` -> `yesil` grubu (#059669), oysa is Temizlik Isleri'ne gider;
    Park ve Bahceler'in zumrut yesiliyle ciziliyordu.

Rogar'in aksine (0011) tasinabilecekleri mevcut bir grup yoktu - levha ne yol
kaplamasi ne altyapidir, cop kutusu da yesil alanin kendisi degil - bu yuzden
palete iki grup eklendi. Renkler ilgili mudurlugun rozet rengiyle ayni secildi.

Iki renk sistemi (grup / mudurluk) bunun ardindan da AYRIDIR: mudurluk veridir
ve admin ekranindan degisir, palet kodda yasar. Yeni acilan bir mudurlugun
turleri mevcut bir gruptan renk alir; frontend derlemesi gerektirmez.

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ESKI_GRUPLAR = ("yesil", "aydinlatma", "yol", "altyapi", "diger")
YENI_GRUPLAR = (
    "yesil",
    "temizlik",
    "aydinlatma",
    "yol",
    "ulasim",
    "altyapi",
    "diger",
)

# tur, eski grup, yeni grup
TASINANLAR = [
    ("trafik_levhasi", "yol", "ulasim"),
    ("cop_kutusu", "yesil", "temizlik"),
]


def _kisiti_yaz(gruplar: Sequence[str]) -> None:
    op.drop_constraint("ck_turler_grup", "turler", type_="check")
    op.create_check_constraint(
        "ck_turler_grup", "turler", "grup IN ('" + "', '".join(gruplar) + "')"
    )


def upgrade() -> None:
    _kisiti_yaz(YENI_GRUPLAR)

    baglanti = op.get_bind()
    for kod, eski, yeni in TASINANLAR:
        # Yalnizca 0009'un yazdigi deger hala duruyorsa: admin turu baska bir
        # gruba almissa karisilmaz (0011'deki rogar tasimasiyla ayni kural).
        baglanti.execute(
            sa.text(
                "UPDATE turler SET grup = :yeni WHERE kod = :kod AND grup = :eski"
            ),
            {"kod": kod, "eski": eski, "yeni": yeni},
        )


def downgrade() -> None:
    baglanti = op.get_bind()
    # Kisit daraltilmadan once gruplari bosaltmak zorunlu: admin bu gruplara
    # baska turler de almis olabilir, hepsi geldikleri gruba doner.
    for _, eski, yeni in TASINANLAR:
        baglanti.execute(
            sa.text("UPDATE turler SET grup = :eski WHERE grup = :yeni"),
            {"eski": eski, "yeni": yeni},
        )
    _kisiti_yaz(ESKI_GRUPLAR)

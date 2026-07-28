"""Yaka (kita) alanlari: Istanbul'un ilce sinirlarindan birlestirilmis, otomatik
gorev atamasinda 'karsiya gecmeyi' engelleyen 3 buyuk bolge.

Bir ekibe yalnizca kendi yakasindaki isler otomatik atanir; Bogaz'in iki yakasi
kus ucusu 2 km olsa da arac ile koprüden ~25 km oldugu icin mesafe esigi tek
basina yetmez (bkz. crud/assignment.py). Alanlar migration 0011'de
data/sinirlar/ilce/34*.json dosyalarindan ST_UnaryUnion ile uretilir."""

import enum

from geoalchemy2 import Geometry
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Yaka(str, enum.Enum):
    """yakalar.kod degerleri. DB'de gercek bir enum tipi degil; users.yaka bu
    tabloya FK ile bagli bir metin sutunu, dogrulama pydantic tarafinda yapilir."""

    avrupa = "avrupa"
    anadolu = "anadolu"
    ada = "ada"


class YakaAlani(Base):
    __tablename__ = "yakalar"

    kod: Mapped[str] = mapped_column(String(16), primary_key=True)
    ad: Mapped[str] = mapped_column(String(64), nullable=False)
    # GiST indeksi migration'da acikca olusturulur (idx_yakalar_geom).
    geom: Mapped[object] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False),
        nullable=False,
    )

"""Kaydedilmis cizimler: gorev bolgeleri (alan) ve guzergahlar (cizgi).

Haritada cizilen bir alan ya da olculen bir cizgi, tek seferlik bir secim
olarak kalmak yerine adlandirilip buraya kaydedilebilir. Kaydedilen kayit bir
saha ekibine atanabilir - alan 'gorev bolgesi', cizgi 'guzergah' olarak: ekip
o gun (ya da atama degisene kadar) orada calisir, kaydi kendi saha ekraninda
gorur ve bitirince tamamlandi olarak isaretler.

Neden ayri bir tablo (ve 'yakalar' gibi migration verisi degil): bolgeler
kullanicinin calisma verisidir - calisma sirasinda olusturulur, adlandirilir,
renklendirilir ve silinir.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class BolgeTipi(str, enum.Enum):
    """Kaydedilen cizimin turu. 'alan' bir (multi)poligon (gorev bolgesi),
    'cizgi' bir LINESTRING (guzergah). Her ikisi de bir saha ekibine
    atanabilir: alan "bu bolgede calis", cizgi "bu guzergahi izle" demektir."""

    alan = "alan"
    cizgi = "cizgi"


class Bolge(Base):
    __tablename__ = "gorev_bolgeleri"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    ad: Mapped[str] = mapped_column(String(120), nullable=False)
    aciklama: Mapped[str | None] = mapped_column(Text, nullable=True)
    tip: Mapped[BolgeTipi] = mapped_column(
        Enum(BolgeTipi, name="bolge_tipi"), nullable=False
    )
    # Haritada cizim rengi (#rrggbb) - kullanici paletten secer.
    renk: Mapped[str] = mapped_column(String(9), nullable=False)
    # Tek sutunda iki geometri turu: tip='alan' -> MULTIPOLYGON,
    # tip='cizgi' -> LINESTRING. GiST indeksi migration'da acikca olusturulur.
    geom: Mapped[object] = mapped_column(
        Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=False),
        nullable=False,
    )
    # Bolgenin atandigi saha ekibi (saha_calisani). NULL ise atanmamis.
    worker_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Saha ekibi isi bitirdiginde dolar. Kayit SILINMEZ: ekip kendi ekraninda
    # "Tamamlanan Isler" altinda gorur ve yanlislikla isaretlediyse geri alir
    # (bkz. tekil bakim gorevlerindeki ayni desen, crud/assignment.py).
    tamamlandi_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tamamlayan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

"""Kaydedilmis cizimler: gorev bolgeleri (alan) ve guzergahlar (cizgi).

Haritada cizilen bir alan ya da olculen bir cizgi adlandirilip buraya
kaydedilebilir ve bir saha ekibine atanabilir; ekip kaydi kendi ekraninda
gorur ve bitirince tamamlandi isaretler.

`yakalar` gibi migration verisi degil ayri bir tablodur: bolgeler kullanicinin
calisma sirasinda olusturdugu, degistirdigi ve sildigi veridir.
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
    # Kaydi sahiplenen mudurluk. Talep/varlik kapsami TURDEN cozulur, ama bir
    # bolgenin turu yoktur - bu yuzden mudurluk kaydin kendi sutununda durur.
    # NULL = GENEL (tum personel gorur), "sahipsiz" degil: admin'in departmani
    # olmadigindan onun cizdigi bolgeler dogal olarak NULL kalir.
    departman: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("departmanlar.kod"), nullable=True
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
    # Ekip isi bitirdiginde dolar; kayit silinmez, "Tamamlanan İşler" altinda
    # kalir ve geri alinabilir.
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

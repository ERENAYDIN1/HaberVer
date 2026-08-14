"""Kaydedilmis guzergahlar (cizgi).

Bolgelerin (models/bolge.py) cizgi karsiligi: haritada olculen bir hat
adlandirilip kaydedilir ve bir saha ekibine atanir - "bu guzergahi izle".
Sutunlari bolgelerle aynidir, ayrilan tek sey geometri tipi (LINESTRING) ve
dolayisiyla olcusu (uzunluk, alan degil).

Iki tablonun ortak bir taban sinifi YOKTUR: alanlar birebir ayni oldugu icin
soyutlamanin kazanci yok, ama her tablonun kendi sutunlarini kendi dosyasinda
okuyabilmenin degeri var.
"""

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Guzergah(Base):
    __tablename__ = "guzergahlar"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    ad: Mapped[str] = mapped_column(String(120), nullable=False)
    aciklama: Mapped[str | None] = mapped_column(Text, nullable=True)
    renk: Mapped[str] = mapped_column(String(9), nullable=False)
    geom: Mapped[object] = mapped_column(
        Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=False),
        nullable=False,
    )
    # NULL = GENEL (tum personel gorur); bkz. models/bolge.py.
    departman: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("departmanlar.kod"), nullable=True
    )
    worker_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
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

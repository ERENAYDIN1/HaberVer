"""Kaydedilmis gorev bolgeleri (alan).

Haritada cizilen bir alan adlandirilip buraya kaydedilebilir ve bir saha
ekibine atanabilir; ekip kaydi kendi ekraninda gorur ve bitirince tamamlandi
isaretler. Cizgi (guzergah) kayitlari ayri bir tablodadir (models/guzergah.py):
iki geometri tek sutunda tutuldugunda her sorgu tipe gore dallanmak zorunda
kaliyordu ve sema "bu satirda gercekten poligon var" diyemiyordu.

`yakalar` gibi migration verisi degil ayri bir tablodur: bolgeler kullanicinin
calisma sirasinda olusturdugu, degistirdigi ve sildigi veridir.
"""

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Bolge(Base):
    __tablename__ = "bolgeler"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    ad: Mapped[str] = mapped_column(String(120), nullable=False)
    aciklama: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Haritada cizim rengi (#rrggbb) - kullanici paletten secer.
    renk: Mapped[str] = mapped_column(String(9), nullable=False)
    geom: Mapped[object] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False),
        nullable=False,
    )
    # PostGIS'in jeodezik olcusu (m2); create/update aninda ST_Area ile
    # hesaplanip yazilir (bkz. crud/bolge.py::_alan_m2). Sorgu basina yeniden
    # hesaplamak yerine kalici sutunda tutulur - okuma sikligi yazmadan
    # kat kat fazla.
    alan_m2: Mapped[float] = mapped_column(Float, nullable=False)
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

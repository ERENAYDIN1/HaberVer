import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base
from .asset import AssetType


class ReportStatus(str, enum.Enum):
    beklemede = "beklemede"
    onaylandi = "onaylandi"
    reddedildi = "reddedildi"


class Report(Base):
    """Vatandas tarafindan gonderilen talep. Onaylaninca bir Asset olusturulur;
    bu yeni varligin id'si created_asset_id'de tutulur."""

    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Vatandasin talep ettigi seyin adi/aciklamasi.
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[AssetType] = mapped_column(
        String(32), ForeignKey("turler.kod", ondelete="RESTRICT"), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Vatandasin isaretledigi nokta. Cizgi/alan destegi kaldirildi (bkz.
    # migration 0016): isin buyuklugunu artik personelin actigi bolge/guzergah
    # kaydi tasiyor.
    geometry: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=False,
    )
    # Seklin temsil noktasi (bkz. migration 0008); nokta-only'de her zaman
    # `geometry`nin kendisidir. Harita pini, otomatik atamanin mesafe hesabi ve
    # yaka cozumlemesi BU kolonu okur ve oyle kalir - kaldirilmasi kazanci
    # olmayan genis bir degisiklik olurdu.
    # ORM adi sutun adindan (`nokta`) BILINCLI olarak farkli: sema tarafinda da
    # `nokta` adinda bir alan var ve pydantic'in `from_attributes` esleme si
    # ikisini birbirine karistirip ham WKB'yi koordinat cifti sanardi.
    temsil_noktasi: Mapped[object] = mapped_column(
        "nokta",
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=False,
    )
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, name="report_status"),
        nullable=False,
        server_default=ReportStatus.beklemede.value,
    )
    # Onay/red bilgisi.
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True
    )
    # Vatandas talebi kendi listesinden kaldirdiginda dolar. GERCEK SILME
    # DEGILDIR: onaylanmis bir talep silinseydi ondan olusan varlik, atamasi ve
    # audit log kayitlari sahipsiz kalirdi. Yalnizca /reports/mine suzer.
    reporter_hidden_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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

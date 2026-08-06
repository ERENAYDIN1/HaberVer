import enum
import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base

# Varlik/talep turu artik bir enum DEGIL, `turler` tablosunun dogal anahtaridir
# (bkz. models/tur.py): admin arayuzden tur ekleyip cikarabilsin diye sozluk
# veriye tasindi. Bu takma ad yalnizca okunabilirlik icindir - "str" yazan bir
# imza turden mi addan mi bahsettigini soylemez. Gecerlilik kontrolu
# `crud/tur.py::dogrula` ve veritabanindaki FK'dir.
AssetType = str


class AssetStatus(str, enum.Enum):
    iyi = "iyi"
    bakim_lazim = "bakim_lazim"


class AssetSource(str, enum.Enum):
    """Varligin nereden geldigi: belediyeye dogrudan kayitli mi, yoksa
    vatandas talebinin onaylanmasiyla mi olustu."""

    kayitli = "kayitli"
    ihbar = "ihbar"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[AssetType] = mapped_column(
        String(32), ForeignKey("turler.kod", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[AssetStatus] = mapped_column(
        Enum(AssetStatus, name="asset_status"),
        nullable=False,
        server_default=AssetStatus.iyi.value,
    )
    source: Mapped[AssetSource] = mapped_column(
        Enum(AssetSource, name="asset_source"),
        nullable=False,
        server_default=AssetSource.kayitli.value,
    )
    # WGS84 (SRID 4326) noktasal geometri. Mekansal indeks migration'da elle oluşturulur.
    geometry: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=False,
    )
    install_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    brand_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    # Varlik "Tamir Edildi" olarak isaretlendiginde (durum -> iyi) dolar; durum
    # tekrar 'bakim_lazim'a donerse temizlenir. Talep kaynakli tamir edilen
    # varliklar bu zamandan 5 gun sonra otomatik silinir (bkz. crud.asset).
    repaired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

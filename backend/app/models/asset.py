import enum
import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Date, DateTime, Enum, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class AssetType(str, enum.Enum):
    """Varlik/ihbar turu. `reports.type` ayni PG enum'unu paylasir (bkz.
    models/report.py) - vatandas ihbari ile envanter ayni sozlugu kullanir.
    Arayuzde turler 5 gruba (yesil alan/aydinlatma/yol/altyapi/diger)
    ayrilir; gruplama yalnizca frontend kavramidir (types/asset.ts).
    `diger` yalnizca ihbardan gelir, envantere elle eklenemez."""

    agac = "agac"
    direk = "direk"
    sulama = "sulama"
    rogar = "rogar"
    yol = "yol"
    kaldirim = "kaldirim"
    bank = "bank"
    cop_kutusu = "cop_kutusu"
    trafik_levhasi = "trafik_levhasi"
    elektrik_panosu = "elektrik_panosu"
    oyun_grubu = "oyun_grubu"
    su_hatti = "su_hatti"
    diger = "diger"


class AssetStatus(str, enum.Enum):
    iyi = "iyi"
    bakim_lazim = "bakim_lazim"


class AssetSource(str, enum.Enum):
    """Varligin nereden geldigi: belediyeye dogrudan kayitli mi, yoksa
    vatandas ihbarinin onaylanmasiyla mi olustu."""

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
        Enum(AssetType, name="asset_type"), nullable=False
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
    # tekrar 'bakim_lazim'a donerse temizlenir. Ihbar kaynakli tamir edilen
    # varliklar bu zamandan 5 gun sonra otomatik silinir (bkz. crud.asset).
    repaired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

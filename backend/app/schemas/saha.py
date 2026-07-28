import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..models.asset import AssetSource, AssetStatus, AssetType
from .asset import PointGeometry


class KonumGuncelle(BaseModel):
    """Saha calisaninin son konumunu bildirmesi (tarayici geolocation)."""

    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class AtamaGirdi(BaseModel):
    """Personelin bir bakim varligini elle bir ekibe (yeniden) atamasi."""

    asset_id: uuid.UUID
    worker_id: uuid.UUID


class VarlikRef(BaseModel):
    """Yalniz varlik referansi (gorevi havuza geri alma icin)."""

    asset_id: uuid.UUID


class GorevRef(BaseModel):
    """Yalniz gorev (assignment) referansi (tamamlanan gorevi geri alma icin)."""

    assignment_id: uuid.UUID


class AktifGorevBilgi(BaseModel):
    """Bir varligin o an atali oldugu ekip + atama bilgisi (elle yonlendirme
    ekraninda 'su an hangi ekipte' gostermek icin). Aktif gorev yoksa null."""

    worker_id: uuid.UUID
    worker_ad: str
    assigned_at: datetime
    otomatik: bool


class GorevDurumu(BaseModel):
    """GET /saha/gorev/{asset_id} yaniti: varligin aktif gorevi (yoksa null) +
    varligin hangi yakada oldugu. Yaka, elle yonlendirme ekraninda 'bu ekip karsi
    yakada' uyarisini gosterebilmek icin dondurulur (elle atama yaka kisitindan
    muaftir, ama personel ne yaptigini gormeli)."""

    gorev: AktifGorevBilgi | None = None
    varlik_yaka: str | None = None
    varlik_yaka_ad: str | None = None


class EkipOzet(BaseModel):
    """Bir saha ekibinin (saha_calisani) konum + yuk ozeti."""

    id: uuid.UUID
    full_name: str | None
    email: str
    longitude: float | None
    latitude: float | None
    last_seen_at: datetime | None
    aktif_gorev: int
    # Ekibin etkin yakasi: users.yaka doluysa o, yoksa son konumundan turetilen
    # (konum da yoksa None). Otomatik atamada bu yakadaki isler verilir.
    yaka: str | None = None

    @classmethod
    def from_row(cls, row) -> "EkipOzet":
        return cls(
            id=row.id,
            full_name=row.full_name,
            email=row.email,
            longitude=row.longitude,
            latitude=row.latitude,
            last_seen_at=row.last_seen_at,
            aktif_gorev=row.aktif_gorev,
            yaka=row.yaka,
        )


class GorevOzet(BaseModel):
    """Personel yonetim panosunda bir ekibin altinda gosterilen tek gorev +
    uzerindeki varlik ozeti."""

    assignment_id: uuid.UUID
    asset_id: uuid.UUID
    name: str
    type: AssetType
    status: AssetStatus
    source: AssetSource
    otomatik: bool
    assigned_at: datetime
    longitude: float
    latitude: float
    # Varligin dustugu yaka; panoda "karsi yakadaki ekibe tasima" uyarisi icin.
    yaka: str | None = None

    @classmethod
    def from_row(cls, row) -> "GorevOzet":
        gorev, asset, longitude, latitude, yaka = row
        return cls(
            assignment_id=gorev.id,
            asset_id=asset.id,
            name=asset.name,
            type=asset.type,
            status=asset.status,
            source=asset.source,
            otomatik=gorev.assigned_by is None,
            assigned_at=gorev.created_at,
            longitude=longitude,
            latitude=latitude,
            yaka=yaka,
        )


class EkipGorevleri(BaseModel):
    """Bir saha ekibi + kendine dusen aktif gorevler (personel yonetim panosu)."""

    id: uuid.UUID
    full_name: str | None
    email: str
    longitude: float | None
    latitude: float | None
    last_seen_at: datetime | None
    aktif_gorev: int
    yaka: str | None = None
    gorevler: list[GorevOzet]


class HavuzVarlik(BaseModel):
    """Havuzda bekleyen (henuz bir ekibe atanmamis) bakim varligi."""

    asset_id: uuid.UUID
    name: str
    type: AssetType
    source: AssetSource
    longitude: float
    latitude: float
    created_at: datetime
    # Varligin son bakima dusme/guncellenme zamani; havuzdaki "bekleme suresi"
    # bundan hesaplanir (created_at kayitli varliklarda kurulus tarihi oldugu
    # icin yaniltici olur - bkz. istek 4).
    updated_at: datetime
    # Varligin dustugu yaka; havuzdan elle atarken "karsi yaka" uyarisi icin.
    yaka: str | None = None

    @classmethod
    def from_row(cls, row) -> "HavuzVarlik":
        asset, longitude, latitude, yaka = row
        return cls(
            asset_id=asset.id,
            name=asset.name,
            type=asset.type,
            source=asset.source,
            longitude=longitude,
            latitude=latitude,
            created_at=asset.created_at,
            updated_at=asset.updated_at,
            yaka=yaka,
        )


class GorevProperties(BaseModel):
    """Bir gorevin (assignment) + uzerindeki varligin ozellikleri."""

    model_config = ConfigDict(from_attributes=True)

    assignment_id: uuid.UUID
    assigned_at: datetime
    # Tamamlanan gorevlerde dolu (aktif gorevlerde None) - "Tamamlanan İşler".
    completed_at: datetime | None = None
    asset_id: uuid.UUID
    name: str
    type: AssetType
    status: AssetStatus
    source: AssetSource
    brand_model: str | None
    photo_url: str | None
    install_date: date | None


class GorevFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PointGeometry
    properties: GorevProperties

    @classmethod
    def from_row(cls, row) -> "GorevFeature":
        """(Assignment, Asset, longitude, latitude) satirini Feature'a cevirir."""
        gorev, asset, longitude, latitude = row
        return cls(
            geometry=PointGeometry(coordinates=(longitude, latitude)),
            properties=GorevProperties(
                assignment_id=gorev.id,
                assigned_at=gorev.created_at,
                completed_at=gorev.completed_at,
                asset_id=asset.id,
                name=asset.name,
                type=asset.type,
                status=asset.status,
                source=asset.source,
                brand_model=asset.brand_model,
                photo_url=asset.photo_url,
                install_date=asset.install_date,
            ),
        )


class GorevFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GorevFeature]

    @classmethod
    def from_rows(cls, rows) -> "GorevFeatureCollection":
        return cls(features=[GorevFeature.from_row(row) for row in rows])

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


class EkipOzet(BaseModel):
    """Bir saha ekibinin (saha_calisani) konum + yuk ozeti."""

    id: uuid.UUID
    full_name: str | None
    email: str
    longitude: float | None
    latitude: float | None
    last_seen_at: datetime | None
    aktif_gorev: int

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
        )


class GorevProperties(BaseModel):
    """Bir gorevin (assignment) + uzerindeki varligin ozellikleri."""

    model_config = ConfigDict(from_attributes=True)

    assignment_id: uuid.UUID
    assigned_at: datetime
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

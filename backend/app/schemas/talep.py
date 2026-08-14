import json
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models.asset import AssetStatus, AssetType
from ..models.talep import TalepStatus

class TalepProperties(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reporter_id: uuid.UUID
    name: str
    type: AssetType
    note: str | None
    photo_url: str | None
    status: TalepStatus
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    review_note: str | None
    created_asset_id: uuid.UUID | None
    created_at: datetime
    # Talebi vatandas kendi listesinden kaldirdi mi (kayit silinmez).
    reporter_hidden_at: datetime | None = None
    # Onaydan olusan varligin GUNCEL durumu; varlik silinmisse (tamir sonrasi
    # otomatik silme) NULL. Vatandas varlik listesini goremedigi icin "Tamir
    # Edildi"yi baska turlu ogrenemezdi - gorunum hesabi bu alandan beslenir.
    asset_status: AssetStatus | None = None
    # Talebin temsil noktasi [lon, lat]; nokta-only'de `geometry` ile ayni
    # degeri tasir (bkz. models/talep.py).
    nokta: tuple[float, float] | None = None
    # Onaydan dogan varlik (varsa) su an aktif bir goreve mi bagli. Harita
    # pini de varlik dairesiyle AYNI atama noktasini gostersin diye.
    assigned: bool = False


class TalepGeometrisi(BaseModel):
    """Vatandasin isaretledigi nokta.

    Cizgi/alan destegi kaldirildi (bkz. migration 0016): sekil tipi hala GeoJSON
    `type`indan okunur, ama tek gecerli deger Point. Sema `Feature.geometry`
    olarak hem istekte hem yanitta kullanildigi icin bicim GeoJSON kalir."""

    type: Literal["Point"]
    coordinates: Any

    @field_validator("coordinates")
    @classmethod
    def _dogrula(cls, v):
        if not (isinstance(v, (list, tuple)) and len(v) == 2):
            raise ValueError("Point koordinati [lon, lat] olmali")
        lon, lat = float(v[0]), float(v[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("Koordinat aralık dışında")
        return [lon, lat]


class TalepFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: TalepGeometrisi
    properties: TalepProperties

    @classmethod
    def from_row(cls, row) -> "TalepFeature":
        talep, geojson, longitude, latitude, asset_status, assigned = row
        ozellikler = TalepProperties.model_validate(talep)
        ozellikler.asset_status = asset_status
        ozellikler.nokta = (longitude, latitude)
        ozellikler.assigned = assigned
        return cls(
            geometry=TalepGeometrisi.model_validate(json.loads(geojson)),
            properties=ozellikler,
        )


class TalepFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[TalepFeature]

    @classmethod
    def from_rows(cls, rows) -> "TalepFeatureCollection":
        return cls(features=[TalepFeature.from_row(row) for row in rows])


class TalepReview(BaseModel):
    """Talebi onaylama/reddetme istegi. review_note red icin gerekce olabilir.

    `type` yalnizca ONAYDA anlamlidir: personel, vatandasin sectigi turu
    (fotografa bakarak) duzeltebilir; verilmezse vatandasin turu aynen kabul
    edilir."""

    review_note: str | None = Field(default=None, max_length=1000)
    type: AssetType | None = None

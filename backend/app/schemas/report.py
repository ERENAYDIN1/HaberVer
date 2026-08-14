import json
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models.asset import AssetStatus, AssetType
from ..models.report import ReportStatus

class ReportProperties(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reporter_id: uuid.UUID
    name: str
    type: AssetType
    note: str | None
    photo_url: str | None
    status: ReportStatus
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
    # degeri tasir (bkz. models/report.py).
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


class ReportFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: TalepGeometrisi
    properties: ReportProperties

    @classmethod
    def from_row(cls, row) -> "ReportFeature":
        report, geojson, longitude, latitude, asset_status, assigned = row
        ozellikler = ReportProperties.model_validate(report)
        ozellikler.asset_status = asset_status
        ozellikler.nokta = (longitude, latitude)
        ozellikler.assigned = assigned
        return cls(
            geometry=TalepGeometrisi.model_validate(json.loads(geojson)),
            properties=ozellikler,
        )


class ReportFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ReportFeature]

    @classmethod
    def from_rows(cls, rows) -> "ReportFeatureCollection":
        return cls(features=[ReportFeature.from_row(row) for row in rows])


class ReportReview(BaseModel):
    """Talebi onaylama/reddetme istegi. review_note red icin gerekce olabilir.

    `type` yalnizca ONAYDA anlamlidir: personel, vatandasin sectigi turu
    (fotografa bakarak) duzeltebilir; verilmezse vatandasin turu aynen kabul
    edilir."""

    review_note: str | None = Field(default=None, max_length=1000)
    type: AssetType | None = None

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..models.asset import AssetType
from ..models.report import ReportStatus
from .asset import PointGeometry


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


class ReportFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PointGeometry
    properties: ReportProperties

    @classmethod
    def from_row(cls, row) -> "ReportFeature":
        report, longitude, latitude = row
        return cls(
            geometry=PointGeometry(coordinates=(longitude, latitude)),
            properties=ReportProperties.model_validate(report),
        )


class ReportFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ReportFeature]

    @classmethod
    def from_rows(cls, rows) -> "ReportFeatureCollection":
        return cls(features=[ReportFeature.from_row(row) for row in rows])


class ReportReview(BaseModel):
    """Ihbari onaylama/reddetme istegi. review_note red icin gerekce olabilir.

    `type` yalnizca ONAYDA anlamlidir: personel, vatandasin sectigi turu
    (fotografa bakarak) duzeltebilir; verilmezse vatandasin turu aynen kabul
    edilir."""

    review_note: str | None = Field(default=None, max_length=1000)
    type: AssetType | None = None

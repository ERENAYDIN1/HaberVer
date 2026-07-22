import uuid
from datetime import date, datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..models.asset import AssetSource, AssetStatus, AssetType


class AssetCreate(BaseModel):
    """Personelin dogrudan girdigi varlik; source her zaman 'kayitli' olur."""

    name: str = Field(min_length=1, max_length=255)
    type: AssetType
    status: AssetStatus = AssetStatus.iyi
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    install_date: date | None = None
    brand_model: str | None = Field(default=None, max_length=255)
    photo_url: str | None = Field(default=None, max_length=512)


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: AssetType | None = None
    status: AssetStatus | None = None
    longitude: float | None = Field(default=None, ge=-180, le=180)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    install_date: date | None = None
    brand_model: str | None = Field(default=None, max_length=255)
    photo_url: str | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def koordinatlar_birlikte_verilmeli(self) -> "AssetUpdate":
        if (self.longitude is None) != (self.latitude is None):
            raise ValueError("longitude ve latitude birlikte gonderilmelidir")
        return self


class AssetProperties(BaseModel):
    """GeoJSON Feature'in properties alani."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: AssetType
    status: AssetStatus
    source: AssetSource
    install_date: date | None
    brand_model: str | None
    photo_url: str | None
    created_at: datetime
    updated_at: datetime


class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]  # [longitude, latitude]


class PolygonGeometry(BaseModel):
    """GeoJSON Polygon. Ilk halka dis sinir, sonrakiler (varsa) delikler."""

    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]]

    @model_validator(mode="after")
    def halkalar_gecerli_olmali(self) -> "PolygonGeometry":
        if not self.coordinates:
            raise ValueError("polygon en az bir halka icermelidir")
        for ring in self.coordinates:
            if len(ring) < 4:
                raise ValueError("her halka en az 4 nokta icermelidir")
            if ring[0] != ring[-1]:
                raise ValueError("halkanin ilk ve son noktasi ayni olmalidir (kapali halka)")
        return self


class MultiPolygonGeometry(BaseModel):
    """GeoJSON MultiPolygon. Birden fazla ayri parcali (adalar, bogazla
    bolunmus il siniri vb.) alanlar icin - her parca kendi halka listesine
    sahiptir (ilk halka dis sinir, sonrakiler varsa delikler)."""

    type: Literal["MultiPolygon"] = "MultiPolygon"
    coordinates: list[list[list[tuple[float, float]]]]

    @model_validator(mode="after")
    def parcalar_gecerli_olmali(self) -> "MultiPolygonGeometry":
        if not self.coordinates:
            raise ValueError("multipolygon en az bir parca icermelidir")
        for polygon in self.coordinates:
            if not polygon:
                raise ValueError("her parca en az bir halka icermelidir")
            for ring in polygon:
                if len(ring) < 4:
                    raise ValueError("her halka en az 4 nokta icermelidir")
                if ring[0] != ring[-1]:
                    raise ValueError(
                        "halkanin ilk ve son noktasi ayni olmalidir (kapali halka)"
                    )
        return self


class WithinQuery(BaseModel):
    """Belirli bir alana dusen varliklari sorgulamak icin istek govdesi."""

    polygon: Annotated[
        Union[PolygonGeometry, MultiPolygonGeometry], Field(discriminator="type")
    ]
    type: AssetType | None = None
    status: AssetStatus | None = None
    source: AssetSource | None = None


class AssetFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PointGeometry
    properties: AssetProperties

    @classmethod
    def from_row(cls, row) -> "AssetFeature":
        """CRUD katmanindan gelen (Asset, longitude, latitude) satirini Feature'a cevirir."""
        asset, longitude, latitude = row
        return cls(
            geometry=PointGeometry(coordinates=(longitude, latitude)),
            properties=AssetProperties.model_validate(asset),
        )


class AssetFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[AssetFeature]

    @classmethod
    def from_rows(cls, rows) -> "AssetFeatureCollection":
        return cls(features=[AssetFeature.from_row(row) for row in rows])

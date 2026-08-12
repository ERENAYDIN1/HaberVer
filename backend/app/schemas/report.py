import json
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models.asset import AssetStatus, AssetType
from ..models.report import ReportStatus

# Elle cizim icin halka basina nokta siniri. `MAKS_HALKA_NOKTASI` (20.000) bir
# ILCE SINIRI icin uygundur; parmakla cizilen bir sikayet sekli icin fazla
# gevsek olur ve gereksizce buyuk govdelere kapi acar.
MAKS_TALEP_NOKTASI = 500


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
    # Talebin temsil noktasi [lon, lat]. `geometry` cizgi/alan oldugunda harita
    # pini ve mesafe hesabi bu noktayi kullanir.
    nokta: tuple[float, float] | None = None
    # Onaydan dogan varlik (varsa) su an aktif bir goreve mi bagli. Harita
    # pini de varlik dairesiyle AYNI atama noktasini gostersin diye.
    assigned: bool = False


class TalepGeometrisi(BaseModel):
    """Vatandasin cizdigi ham sekil: Point, LineString veya Polygon."""

    type: Literal["Point", "LineString", "Polygon"]
    coordinates: Any

    @field_validator("coordinates")
    @classmethod
    def _dogrula(cls, v, info):
        tip = info.data.get("type")
        if tip == "Point":
            if not (isinstance(v, (list, tuple)) and len(v) == 2):
                raise ValueError("Point koordinati [lon, lat] olmali")
            return [float(v[0]), float(v[1])]
        if tip == "LineString":
            halka = _halka(v, en_az=2, ad="Çizgi")
            return halka
        if tip == "Polygon":
            if not (isinstance(v, (list, tuple)) and len(v) == 1):
                raise ValueError("Alan tek bir dış halkadan oluşmalı")
            halka = _halka(v[0], en_az=3, ad="Alan")
            # Istemcinin halkayi kapatmis olmasi beklenmez; GeoJSON kurali
            # geregi kapatilir (bkz. bolge semasindaki ayni davranis).
            if halka[0] != halka[-1]:
                halka.append(list(halka[0]))
            if len(halka) < 4:
                raise ValueError("Alan en az 3 farklı nokta içermeli")
            return [halka]
        return v


def _halka(noktalar, en_az: int, ad: str) -> list[list[float]]:
    if not isinstance(noktalar, (list, tuple)) or len(noktalar) < en_az:
        raise ValueError(f"{ad} en az {en_az} nokta içermeli")
    if len(noktalar) > MAKS_TALEP_NOKTASI:
        raise ValueError(f"{ad} en fazla {MAKS_TALEP_NOKTASI} nokta içerebilir")
    cikti: list[list[float]] = []
    for n in noktalar:
        if not (isinstance(n, (list, tuple)) and len(n) == 2):
            raise ValueError("Her nokta [lon, lat] olmalı")
        lon, lat = float(n[0]), float(n[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("Koordinat aralık dışında")
        cikti.append([lon, lat])
    return cikti


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


class ReportSekilGuncelle(BaseModel):
    """Bekleyen ya da onaylanmis bir talebin ham seklini (geometry) yerinde
    degistirir - vatandas yanlis cizmis olabilir. Tip (Point/LineString/
    Polygon) sabit kalir; noktalar kaydin MEVCUT sekil tipiyle ayni sekilde
    dogrulanir (bkz. TalepGeometrisi)."""

    geometry: TalepGeometrisi


class ReportReview(BaseModel):
    """Talebi onaylama/reddetme istegi. review_note red icin gerekce olabilir.

    `type` yalnizca ONAYDA anlamlidir: personel, vatandasin sectigi turu
    (fotografa bakarak) duzeltebilir; verilmezse vatandasin turu aynen kabul
    edilir."""

    review_note: str | None = Field(default=None, max_length=1000)
    type: AssetType | None = None

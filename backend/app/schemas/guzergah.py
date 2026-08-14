"""Kaydedilmis guzergah (cizgi) semalari - bolge semalarinin simetrigi.

Tek fark geometrinin sekli (tek nokta dizisi, halka listesi degil) ve olcusu
(uzunluk, alan degil); geri kalan alanlar bolgelerle birebir aynidir.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from .bolge import RENK_DESENI, _nokta_sayisi_sinirli


class GuzergahGirdi(BaseModel):
    """Yeni bir guzergah kaydi.

    `noktalar` bolgelerle AYNI sekli tasir (liste listesi) ama tam olarak tek
    eleman icerir: guzergahin nokta dizisi. Sekil ortak tutulur ki frontend'in
    cizim/duzenleme mantigi iki kayit turu icin ayrismasin."""

    ad: str = Field(min_length=1, max_length=120)
    aciklama: str | None = Field(default=None, max_length=1000)
    renk: str = Field(default="#059669", pattern=RENK_DESENI)
    # Yalnizca admin secebilir; departmani olan personelin kaydi kendi
    # mudurlugune yazilir (bkz. routers/guzergahlar.py). None = genel.
    departman: str | None = Field(default=None, max_length=32)
    noktalar: list[list[tuple[float, float]]]

    @model_validator(mode="after")
    def noktalar_gecerli_olmali(self) -> "GuzergahGirdi":
        if len(self.noktalar) != 1:
            raise ValueError("guzergah tam olarak tek bir nokta dizisi icermelidir")
        if len(self.noktalar[0]) < 2:
            raise ValueError("guzergah en az 2 nokta icermelidir")
        _nokta_sayisi_sinirli(self.noktalar)
        return self


class GuzergahGuncelle(BaseModel):
    """Kaydedilmis bir guzergahin guncellenmesi: ad/aciklama/renk ve GEOMETRI
    (bkz. BolgeGuncelle - ayni yerinde duzenleme mantigi)."""

    ad: str | None = Field(default=None, min_length=1, max_length=120)
    aciklama: str | None = Field(default=None, max_length=1000)
    renk: str | None = Field(default=None, pattern=RENK_DESENI)
    departman: str | None = Field(default=None, max_length=32)
    noktalar: list[list[tuple[float, float]]] | None = None

    @model_validator(mode="after")
    def noktalar_bos_olmamali(self) -> "GuzergahGuncelle":
        if self.noktalar is not None:
            if not self.noktalar:
                raise ValueError("en az bir nokta dizisi gonderilmelidir")
            _nokta_sayisi_sinirli(self.noktalar)
        return self


class GuzergahAtama(BaseModel):
    """Guzergahi bir saha ekibine atar; worker_id=None atamayi kaldirir."""

    worker_id: uuid.UUID | None = None


class GuzergahCikti(BaseModel):
    id: uuid.UUID
    ad: str
    aciklama: str | None
    renk: str
    departman: str | None = None
    noktalar: list[list[tuple[float, float]]]
    # PostGIS ile hesaplanan jeodezik uzunluk (metre).
    uzunluk_m: float | None = None
    worker_id: uuid.UUID | None = None
    worker_ad: str | None = None
    assigned_at: datetime | None = None
    # Isin dustugu yaka; temsil noktasi hattin ortasidir.
    yaka: str | None = None
    tamamlandi_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class GuzergahTamamlama(BaseModel):
    """Saha ekibinin guzergahi tamamlandi isaretlemesi; tamamlandi=False ile
    yanlislikla kapatilan is geri alinir."""

    tamamlandi: bool = True

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from ..models.bolge import BolgeTipi

# Renk her zaman #rrggbb (frontend'deki renk secici bunu uretir).
RENK_DESENI = r"^#[0-9a-fA-F]{6}$"


class BolgeGirdi(BaseModel):
    """Yeni bir gorev bolgesi / guzergah kaydi.

    `noktalar` her iki tipte de bir LISTE LISTESIDIR (sinirlar API'siyle ayni
    sekil, bkz. schemas'taki SinirGeometri kullanimi):
      * tip='alan'  -> her eleman bir poligon halkasi ([lon,lat] cifti listesi).
                       Halkalarin kapali olmasi gerekmez, backend kapatir.
      * tip='cizgi' -> tam olarak tek eleman: cizginin nokta dizisi.
    """

    ad: str = Field(min_length=1, max_length=120)
    aciklama: str | None = Field(default=None, max_length=1000)
    tip: BolgeTipi
    renk: str = Field(default="#059669", pattern=RENK_DESENI)
    noktalar: list[list[tuple[float, float]]]

    @model_validator(mode="after")
    def noktalar_gecerli_olmali(self) -> "BolgeGirdi":
        if not self.noktalar:
            raise ValueError("en az bir nokta dizisi gonderilmelidir")
        if self.tip is BolgeTipi.cizgi:
            if len(self.noktalar) != 1:
                raise ValueError("cizgi tam olarak tek bir nokta dizisi icermelidir")
            if len(self.noktalar[0]) < 2:
                raise ValueError("cizgi en az 2 nokta icermelidir")
        else:
            for halka in self.noktalar:
                if len(halka) < 3:
                    raise ValueError("her alan halkasi en az 3 nokta icermelidir")
        return self


class BolgeGuncelle(BaseModel):
    """Kaydedilmis bir bolgenin guncellenmesi: ad/aciklama/renk ve GEOMETRI.

    `noktalar` verilirse kaydin sekli degisir (haritada koseler surukleyerek /
    kenara nokta ekleyerek / alani genisletip daraltarak duzenlenir). Sekil
    yerinde guncellenir: kaydin kimligi, atamasi ve gecmisi korunur - bir
    bolgenin sinirlarini duzeltmek yeni bir bolge acmayi gerektirmesin.
    Sekil KENDI TIPINDE kalir (alan alan, cizgi cizgi); tipe gore nokta sayisi
    dogrulamasi router'da yapilir (tip mevcut kayittan bilinir)."""

    ad: str | None = Field(default=None, min_length=1, max_length=120)
    aciklama: str | None = Field(default=None, max_length=1000)
    renk: str | None = Field(default=None, pattern=RENK_DESENI)
    noktalar: list[list[tuple[float, float]]] | None = None

    @model_validator(mode="after")
    def noktalar_bos_olmamali(self) -> "BolgeGuncelle":
        if self.noktalar is not None and not self.noktalar:
            raise ValueError("en az bir nokta dizisi gonderilmelidir")
        return self


class BolgeAtama(BaseModel):
    """Bolgeyi/guzergahi bir saha ekibine atar; worker_id=None atamayi kaldirir."""

    worker_id: uuid.UUID | None = None


class BolgeCikti(BaseModel):
    id: uuid.UUID
    ad: str
    aciklama: str | None
    tip: BolgeTipi
    renk: str
    noktalar: list[list[tuple[float, float]]]
    # PostGIS ile hesaplanan gercek (jeodezik) olculer: alan bolgelerde m2,
    # cizgilerde metre. Frontend'deki duzlemsel yaklastirmadan bagimsiz,
    # kaydedilen deger her zaman ayni cikar.
    alan_m2: float | None = None
    uzunluk_m: float | None = None
    worker_id: uuid.UUID | None = None
    worker_ad: str | None = None
    assigned_at: datetime | None = None
    # Saha ekibi isi bitirdiginde dolar; None ise is devam ediyor demektir.
    tamamlandi_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BolgeTamamlama(BaseModel):
    """Saha ekibinin bolgeyi/guzergahi tamamlandi isaretlemesi; tamamlandi=False
    ile yanlislikla kapatilan is geri alinir."""

    tamamlandi: bool = True

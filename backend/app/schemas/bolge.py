import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from .geo import MAKS_HALKA_NOKTASI

# Renk her zaman #rrggbb (frontend'deki renk secici bunu uretir).
RENK_DESENI = r"^#[0-9a-fA-F]{6}$"


def _nokta_sayisi_sinirli(noktalar: list[list[tuple[float, float]]]) -> None:
    """Kaydedilen geometrinin dizi basina nokta ust siniri (bkz. schemas/geo.py).
    Bolgeler kalici olarak yazildigi icin sinir burada ayrica gerekli: sinirsiz
    bir geometri hem PostGIS'i hem sonraki her okumayi surekli mesgul ederdi."""
    for dizi in noktalar:
        if len(dizi) > MAKS_HALKA_NOKTASI:
            raise ValueError(
                f"bir nokta dizisi en fazla {MAKS_HALKA_NOKTASI} nokta icerebilir"
            )


class BolgeGirdi(BaseModel):
    """Yeni bir gorev bolgesi kaydi.

    `noktalar` bir LISTE LISTESIDIR (sinirlar API'siyle ayni sekil): her eleman
    bir poligon halkasi ([lon,lat] cifti listesi). Halkalarin kapali olmasi
    gerekmez, backend kapatir."""

    ad: str = Field(min_length=1, max_length=120)
    aciklama: str | None = Field(default=None, max_length=1000)
    renk: str = Field(default="#059669", pattern=RENK_DESENI)
    # Kaydi sahiplenecek mudurluk. YALNIZCA ADMIN icin anlamlidir: departmani
    # olan personelin kaydi her zaman kendi mudurlugune yazilir, gonderdigi
    # deger yok sayilir (bkz. routers/bolgeler.py). None = genel.
    departman: str | None = Field(default=None, max_length=32)
    noktalar: list[list[tuple[float, float]]]

    @model_validator(mode="after")
    def noktalar_gecerli_olmali(self) -> "BolgeGirdi":
        if not self.noktalar:
            raise ValueError("en az bir nokta dizisi gonderilmelidir")
        for halka in self.noktalar:
            if len(halka) < 3:
                raise ValueError("her alan halkasi en az 3 nokta icermelidir")
        _nokta_sayisi_sinirli(self.noktalar)
        return self


class BolgeGuncelle(BaseModel):
    """Kaydedilmis bir bolgenin guncellenmesi: ad/aciklama/renk ve GEOMETRI.

    `noktalar` verilirse kaydin sekli degisir (haritada koseler surukleyerek /
    kenara nokta ekleyerek / alani genisletip daraltarak duzenlenir). Sekil
    yerinde guncellenir: kaydin kimligi, atamasi ve gecmisi korunur - bir
    bolgenin sinirlarini duzeltmek yeni bir bolge acmayi gerektirmesin."""

    ad: str | None = Field(default=None, min_length=1, max_length=120)
    aciklama: str | None = Field(default=None, max_length=1000)
    renk: str | None = Field(default=None, pattern=RENK_DESENI)
    # Kaydi baska bir mudurluge devretmek (yalnizca admin). `exclude_unset` ile
    # ayirt edilir: `departman: null` "genel yap", alani hic gondermemek
    # "dokunma" demektir - UserUpdate.yaka ile ayni desen.
    departman: str | None = Field(default=None, max_length=32)
    noktalar: list[list[tuple[float, float]]] | None = None

    @model_validator(mode="after")
    def noktalar_bos_olmamali(self) -> "BolgeGuncelle":
        if self.noktalar is not None:
            if not self.noktalar:
                raise ValueError("en az bir nokta dizisi gonderilmelidir")
            _nokta_sayisi_sinirli(self.noktalar)
        return self


class BolgeAtama(BaseModel):
    """Bolgeyi bir saha ekibine atar; worker_id=None atamayi kaldirir."""

    worker_id: uuid.UUID | None = None


class BolgeCikti(BaseModel):
    id: uuid.UUID
    ad: str
    aciklama: str | None
    renk: str
    # Kaydi sahiplenen mudurluk; None = genel (tum personel gorur). Adi
    # frontend departman sozlugunden cozer - burada tekrarlanmaz.
    departman: str | None = None
    noktalar: list[list[tuple[float, float]]]
    # PostGIS ile hesaplanan gercek (jeodezik) olcu. Frontend'deki duzlemsel
    # yaklastirmadan bagimsiz, kaydedilen deger her zaman ayni cikar.
    alan_m2: float | None = None
    worker_id: uuid.UUID | None = None
    worker_ad: str | None = None
    assigned_at: datetime | None = None
    # Isin dustugu yaka (kaydin temsil noktasindan cozulur: ST_PointOnSurface).
    # Elle atamada "karsi yaka" uyarisi varliklardakiyle ayni bilgiye dayansin
    # diye burada doner.
    yaka: str | None = None
    # Saha ekibi isi bitirdiginde dolar; None ise is devam ediyor demektir.
    tamamlandi_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BolgeTamamlama(BaseModel):
    """Saha ekibinin bolgeyi tamamlandi isaretlemesi; tamamlandi=False ile
    yanlislikla kapatilan is geri alinir."""

    tamamlandi: bool = True

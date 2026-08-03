from pydantic import BaseModel, Field, model_validator

# Bir alanin halka basina kabul edilen azami nokta sayisi. Sinir PostGIS'i
# korur: alan sayisi (50) sinirlandirilmisti ama nokta sayisi degildi, yani
# "50 alan" yerine "1 alan, 500.000 kose" gondererek ayni yuk uretilebiliyordu.
# En buyuk mesru girdi Istanbul il siniri (~900 nokta) ve elle cizilen alanlar
# (onlarca nokta); 20.000 rahat bir tavandir.
MAKS_HALKA_NOKTASI = 20_000


def _halkalari_dogrula(halkalar: list[list[tuple[float, float]]]) -> None:
    """Alan halkalarinin ortak dogrulamasi: bos olmamali, her halka en az 3
    nokta icermeli ve ust nokta sinirini asmamali."""
    if not halkalar:
        raise ValueError("en az bir halka gonderilmelidir")
    for halka in halkalar:
        if len(halka) < 3:
            raise ValueError("her halka en az 3 nokta icermelidir")
        if len(halka) > MAKS_HALKA_NOKTASI:
            raise ValueError(
                f"bir halka en fazla {MAKS_HALKA_NOKTASI} nokta icerebilir"
            )


class AlanGirdi(BaseModel):
    """Alan ozeti icin tek bir alan: istemcideki id + halka listesi."""

    id: str = Field(min_length=1, max_length=64)
    # Halka listesi (MultiPolygon parcalari). Kullanicinin cizdigi alanlarda tek
    # elemanli, ilce/mahalle sinirlarinda cok elemanli olabilir. Halkalarin
    # kapali olmasi gerekmez; backend kapatir.
    noktalar: list[list[tuple[float, float]]]

    @model_validator(mode="after")
    def halkalar_gecerli_olmali(self) -> "AlanGirdi":
        _halkalari_dogrula(self.noktalar)
        return self


class AlanOzetiGirdi(BaseModel):
    """Secili alanlarin cakismayi hesaba katan olcu ozeti icin istek govdesi.
    Alanlar LISTEDEKI SIRAYLA degerlendirilir: bir alanin 'net' katkisi,
    kendisinden ONCE gelenlerle cakismayan kismidir."""

    alanlar: list[AlanGirdi] = Field(min_length=1, max_length=50)


class AlanOlcusu(BaseModel):
    id: str
    # Alanin kendi (jeodezik) buyuklugu, cakismaya bakilmaksizin.
    kendi_m2: float
    # Bu alanin toplama NET katkisi: kendisinden onceki alanlarla cakisan kismi
    # dusulmus hali. Tamamen mevcut bir alanin uzerine cizildiyse 0 olur.
    net_m2: float


class TamponGirdi(BaseModel):
    """Bir alani metre cinsinden genisletme/daraltma istegi (sekil duzenleme
    panelindeki "Genişlet / Daralt"). Negatif mesafe daraltir."""

    noktalar: list[list[tuple[float, float]]]
    mesafe_m: float = Field(ge=-10_000, le=10_000)

    @model_validator(mode="after")
    def halkalar_gecerli_olmali(self) -> "TamponGirdi":
        _halkalari_dogrula(self.noktalar)
        if self.mesafe_m == 0:
            raise ValueError("mesafe sifir olamaz")
        return self


class TamponCikti(BaseModel):
    noktalar: list[list[tuple[float, float]]]
    # PostGIS'in jeodezik olcusu - panel sonucu hemen gosterebilsin.
    alan_m2: float


class AlanOzeti(BaseModel):
    """Alanlarin tek tek olculeri + cakismalarin tek kez sayildigi toplam.
    toplam_m2, net_m2 degerlerinin toplamidir (net parcalar tanim geregi
    ayriktir), yani alanlarin birlesim (union) alanidir."""

    alanlar: list[AlanOlcusu]
    toplam_m2: float
    # Ham toplam (kendi_m2 toplami) - cakisma varsa toplam_m2'den buyuktur.
    ham_toplam_m2: float


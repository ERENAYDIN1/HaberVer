from pydantic import BaseModel, ConfigDict, Field

from ..models.asset import AssetType

# Kod dogal anahtardir: `users.departman`, `tur_departman.departman_kod`,
# `activity_logs.departman`, `bolgeler.departman` ve `guzergahlar.departman`
# ona baglanir.
# Sonradan degistirilemez.
KOD_DESENI = r"^[a-z][a-z0-9_]{1,31}$"
RENK_DESENI = r"^#[0-9a-fA-F]{6}$"


class DepartmanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kod: str
    ad: str
    aciklama: str | None
    renk: str
    aktif: bool
    # Lejant ve tur acilirlari mudurlugu ANA BASLIK olarak kullaniyor; sira
    # artik bir gorunum tercihi degil, kullanicinin ekranda gordugu duzen.
    sira: int


class DepartmanCreate(BaseModel):
    kod: str = Field(pattern=KOD_DESENI)
    ad: str = Field(min_length=1, max_length=120)
    aciklama: str | None = Field(default=None, max_length=1000)
    renk: str = Field(default="#64748b", pattern=RENK_DESENI)
    aktif: bool = True
    sira: int = 100


class DepartmanUpdate(BaseModel):
    """Kod DEGISTIRILEMEZ; ad/aciklama/renk, sira ve gorunurluk duzeltilebilir."""

    ad: str | None = Field(default=None, min_length=1, max_length=120)
    aciklama: str | None = Field(default=None, max_length=1000)
    renk: str | None = Field(default=None, pattern=RENK_DESENI)
    aktif: bool | None = None
    sira: int | None = None


class EslemeOut(BaseModel):
    """tur -> departman_kod. Frontend bunu bir sozluk gibi kullanir: vatandas
    formunda "hangi mudurluge gidecek" ipucu, personel tarafinda rozetler."""

    esleme: dict[AssetType, str]


class EslemeUpdate(BaseModel):
    """Yalnizca DEGISEN turler gonderilebilir; gonderilmeyen tur oldugu gibi
    kalir (kismi guncelleme)."""

    esleme: dict[AssetType, str]

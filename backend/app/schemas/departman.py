from pydantic import BaseModel, ConfigDict

from ..models.asset import AssetType


class DepartmanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kod: str
    ad: str
    aciklama: str | None
    renk: str
    aktif: bool


class EslemeOut(BaseModel):
    """tur -> departman_kod. Frontend bunu bir sozluk gibi kullanir: vatandas
    formunda "hangi mudurluge gidecek" ipucu, personel tarafinda rozetler."""

    esleme: dict[AssetType, str]


class EslemeUpdate(BaseModel):
    """Yalnizca DEGISEN turler gonderilebilir; gonderilmeyen tur oldugu gibi
    kalir (kismi guncelleme)."""

    esleme: dict[AssetType, str]

from pydantic import BaseModel, ConfigDict, Field

from ..models.tur import TUR_GRUPLARI

# Kod dogal anahtardir ve `assets.type` / `talepler.type` icinde YASAR: sonradan
# degistirilemez, bu yuzden dar tutulur (kucuk harf + alt cizgi). Bir tur kodu
# bir kez yazildiktan sonra veritabanindaki tum kayitlarin anlamidir.
KOD_DESENI = r"^[a-z][a-z0-9_]{1,31}$"


class TurOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kod: str
    ad: str
    grup: str
    glif: str | None


class TurCreate(BaseModel):
    """Yeni tur. `departman` ZORUNLUDUR: yonlendirmesi olmayan bir tur hicbir
    mudurlugun kapsamina girmez, yani olusturulur olusturulmaz gorunmez olur -
    admin'in bunu ayri bir adimda hatirlamasi beklenmemeli."""

    kod: str = Field(pattern=KOD_DESENI)
    ad: str = Field(min_length=1, max_length=120)
    grup: str
    glif: str | None = Field(default=None, max_length=32)
    departman: str = Field(min_length=1, max_length=32)

    @property
    def gecerli_grup(self) -> bool:
        return self.grup in TUR_GRUPLARI


class TurUpdate(BaseModel):
    """Kod DEGISTIRILEMEZ (kayitlarin icinde yasayan deger odur); ad, grup ve
    glif duzeltilebilir."""

    ad: str | None = Field(default=None, min_length=1, max_length=120)
    grup: str | None = None
    glif: str | None = Field(default=None, max_length=32)

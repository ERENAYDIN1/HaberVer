import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..security import get_current_user

VERI_DIZINI = Path(__file__).parent.parent / "data" / "sinirlar"

# Sinir verisi giris yapmis herhangi bir kullaniciya acik (personel harita
# filtreleri + gerekirse vatandas ekrani icin).
router = APIRouter(
    prefix="/api/sinirlar",
    tags=["sinirlar"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _dosya_oku(yol: Path) -> dict:
    return json.loads(yol.read_text(encoding="utf-8"))


@router.get("/iller")
def iller():
    """Tum illerin kod/ad listesi (sinir geometrisi icermez)."""
    return _dosya_oku(VERI_DIZINI / "iller.json")


@router.get("/ilceler")
def ilceler(il: str | None = None):
    """Ilcelerin kod/ad listesi; il verilirse o ile ait ilceler."""
    tumu = _dosya_oku(VERI_DIZINI / "ilceler.json")
    if il is None:
        return tumu
    return [ilce for ilce in tumu if ilce["ilKodu"] == il]


@router.get("/il/{kod}")
def il_siniri(kod: str):
    yol = VERI_DIZINI / "il" / f"{kod}.json"
    if not yol.exists():
        raise HTTPException(status_code=404, detail="Il bulunamadi")
    return _dosya_oku(yol)


@router.get("/ilce/{kod}")
def ilce_siniri(kod: str):
    yol = VERI_DIZINI / "ilce" / f"{kod}.json"
    if not yol.exists():
        raise HTTPException(status_code=404, detail="Ilce bulunamadi")
    return _dosya_oku(yol)


@router.get("/mahalleler")
def mahalleler(ilce: str | None = None):
    """Mahallelerin kod/ad listesi; ilce verilirse o ilceye ait mahalleler.
    Not: mahalle verisi su an yalnizca Istanbul (34xxx ilceleri) icindir."""
    tumu = _dosya_oku(VERI_DIZINI / "mahalleler.json")
    if ilce is None:
        return tumu
    return [m for m in tumu if m["ilceKodu"] == ilce]


@router.get("/mahalle/{kod}")
def mahalle_siniri(kod: str):
    yol = VERI_DIZINI / "mahalle" / f"{kod}.json"
    if not yol.exists():
        raise HTTPException(status_code=404, detail="Mahalle bulunamadi")
    return _dosya_oku(yol)

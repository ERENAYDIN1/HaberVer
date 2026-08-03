import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..security import get_current_user

# Mahalle verisi yalnizca Istanbul icin var; koordinat->mahalle cozumlemesi de
# bu il koduyla sinirli.
ISTANBUL_IL_KODU = "34"

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


# --- Koordinat -> ilce/mahalle cozumleme -------------------------------------
# Bir varligin detayinda "hangi ilce/mahallede" bilgisini gostermek icin nokta,
# Istanbul mahalle/ilce sinir poligonlariyla eslestirilir. Poligonlar ilk cagride
# bbox indeksiyle birlikte belleğe alinir (yalnizca Istanbul, ~968 mahalle).


def _nokta_poligonda(lon: float, lat: float, halka: list[list[float]]) -> bool:
    """Isin atma (ray casting) ile tek bir halkanin icinde mi kontrolu."""
    icinde = False
    n = len(halka)
    j = n - 1
    for i in range(n):
        xi, yi = halka[i][0], halka[i][1]
        xj, yj = halka[j][0], halka[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            icinde = not icinde
        j = i
    return icinde


def _bbox(halkalar: list[list[list[float]]]) -> tuple[float, float, float, float]:
    xs = [p[0] for halka in halkalar for p in halka]
    ys = [p[1] for halka in halkalar for p in halka]
    return min(xs), min(ys), max(xs), max(ys)


@lru_cache
def _cozumleme_indeksi() -> dict:
    """Istanbul mahalle + ilce poligonlarini (bbox + halkalar) hazirlar."""
    ilce_adlari = {
        i["kod"]: i["ad"]
        for i in _dosya_oku(VERI_DIZINI / "ilceler.json")
        if i["ilKodu"] == ISTANBUL_IL_KODU
    }

    mahalle_index = []
    for m in _dosya_oku(VERI_DIZINI / "mahalleler.json"):
        yol = VERI_DIZINI / "mahalle" / f"{m['kod']}.json"
        if not yol.exists():
            continue
        halkalar = _dosya_oku(yol)["noktalar"]
        mahalle_index.append(
            {
                "kod": m["kod"],
                "ad": m["ad"],
                "ilceKodu": m["ilceKodu"],
                "bbox": _bbox(halkalar),
                "halkalar": halkalar,
            }
        )

    ilce_index = []
    for kod, ad in ilce_adlari.items():
        yol = VERI_DIZINI / "ilce" / f"{kod}.json"
        if not yol.exists():
            continue
        halkalar = _dosya_oku(yol)["noktalar"]
        ilce_index.append(
            {"kod": kod, "ad": ad, "bbox": _bbox(halkalar), "halkalar": halkalar}
        )

    return {"ilce_adlari": ilce_adlari, "mahalleler": mahalle_index, "ilceler": ilce_index}


def _poligonda(lon: float, lat: float, kayit: dict) -> bool:
    minx, miny, maxx, maxy = kayit["bbox"]
    if lon < minx or lon > maxx or lat < miny or lat > maxy:
        return False
    return any(_nokta_poligonda(lon, lat, halka) for halka in kayit["halkalar"])


def _konum_coz(lon: float, lat: float, idx: dict) -> dict:
    """Tek bir noktayi ilce/mahalleye cozumler (indeks disaridan verilir)."""
    mahalle = None
    ilce_kodu = None
    for m in idx["mahalleler"]:
        if _poligonda(lon, lat, m):
            mahalle = {"kod": m["kod"], "ad": m["ad"]}
            ilce_kodu = m["ilceKodu"]
            break

    if ilce_kodu is not None:
        ilce = {"kod": ilce_kodu, "ad": idx["ilce_adlari"].get(ilce_kodu, "")}
    else:
        ilce = None
        for i in idx["ilceler"]:
            if _poligonda(lon, lat, i):
                ilce = {"kod": i["kod"], "ad": i["ad"]}
                break

    return {"ilce": ilce, "mahalle": mahalle}


@router.get("/konum")
def konum_cozumle(lat: float, lon: float):
    """Bir koordinatin dustugu Istanbul ilce ve mahallesini dondurur.

    Donen: {"ilce": {kod, ad} | null, "mahalle": {kod, ad} | null}
    Nokta Istanbul disindaysa ikisi de null olur."""
    return _konum_coz(lon, lat, _cozumleme_indeksi())


class TopluKonumIstek(BaseModel):
    """Toplu koordinat cozumleme istegi.

    `max_length` ZORUNLU bir korumadir, kozmetik bir sinir degil: her nokta ~968
    mahalle + 39 ilce poligonuna karsi SAF PYTHON ray-casting ile taranir ve
    Istanbul disindaki bir nokta hicbir bbox'a girmedigi icin listenin sonuna
    kadar gezilir - yani en pahali girdi ayni zamanda en kolay uretilen girdidir.
    Sinirsiz birakildiginda, kendi kaydolmus herhangi bir vatandas hesabi
    yuz binlerce noktayla istek atip CPU'yu doldurabiliyordu; uc senkron (`def`)
    oldugu icin bu ayni zamanda FastAPI'nin thread havuzunu tuketip TUM API'yi
    yanit veremez hale getiriyordu. Mesru kullanim (Dashboard'daki varlik
    dagilimi) birkac duzine noktadir; 5000 fazlasiyla genis bir tavan."""

    # Her nokta [lon, lat] sirasindadir (GeoJSON koordinat sirasi).
    noktalar: list[tuple[float, float]] = Field(min_length=1, max_length=5000)


@router.post("/konum/toplu")
def konum_cozumle_toplu(istek: TopluKonumIstek):
    """Birden fazla koordinati tek istekte cozumler (varlik dagilimi icin).

    Donen: girisle ayni sirada [{ilce, mahalle}, ...] listesi. Indeks bir kez
    hazirlanip tum noktalar icin yeniden kullanilir."""
    idx = _cozumleme_indeksi()
    return [_konum_coz(lon, lat, idx) for lon, lat in istek.noktalar]

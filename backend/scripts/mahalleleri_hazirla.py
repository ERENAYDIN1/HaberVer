"""Istanbul mahalle sinir verisini uretir (il/ilce verisiyle ayni format).

Kaynak: https://github.com/sahircansurmeli/istanbul-geojson (`mahalle_geojson.json`)
Asil veri OpenStreetMap'ten turetilmistir (Nominatim `lookup`), lisans
**ODbL 1.0** ("Data (c) OpenStreetMap contributors"). Proje zaten OSM/Nominatim
kullaniyor (bkz. KonumArama), bu yuzden bu ek kaynak lisans acisindan tutarli.
Bkz. backend/app/data/sinirlar/KAYNAK.md.

Bu script tek seferlik/manuel calistirilir (runtime'in bir parcasi degildir).
Ham kaynak dosyasi (~12MB, git'e girmez) su komutla indirilebilir:

  curl -o backend/scripts/_kaynak/istanbul_mahalleler_raw.geojson \
    https://raw.githubusercontent.com/sahircansurmeli/istanbul-geojson/master/mahalle_geojson.json

Cikti, repo icine committlenen kucuk/basitlestirilmis dosyalardir:
  backend/app/data/sinirlar/mahalle/<mahalleKodu>.json -> {kod, ad, ilceKodu, noktalar}
  backend/app/data/sinirlar/mahalleler.json            -> [{kod, ad, ilceKodu}]

Onemli noktalar:
- Ham kaynak, Nominatim yanitlarinin (50'lik parcalar) birlestirilmesinden
  dolayi feature'lar arasinda VIRGUL EKSIK bir JSON'dur; once onarilir.
- Her mahallenin hangi ILCEye ait oldugu, mahalle display_name'i guvenilir
  olmadigindan (cogu mahallede ilce adi yok) AD ESLESTIRMESIYLE DEGIL,
  MEKANSAL OLARAK bulunur: mahalle temsili noktasi (en genis parcanin merkezi)
  mevcut Istanbul ilce sinirlarinin (backend/app/data/sinirlar/ilce/34*.json)
  hangisinin icine dusuyorsa o ilceye baglanir. Sinira/suya tasan birkac kiyi/
  ada mahallesi icin "en yakin ilce merkezi" yedegi kullanilir.
- Mahalle kodu: <ilceKodu><3 haneli sira> (orn. 34001003) - ilce icinde ada
  gore siralanip numaralanir; boylece kod hem benzersiz hem gruplu/okunabilir.
- Basitlestirme: il/ilce ile ayni yaklasim (Douglas-Peucker + 5 ondalik
  yuvarlama), ama mahalleler kucuk oldugundan daha ince ~20m tolerans.
"""

import glob
import json
import re
from pathlib import Path

KAYNAK = Path(__file__).parent / "_kaynak" / "istanbul_mahalleler_raw.geojson"
VERI_DIZINI = Path(__file__).parent.parent / "app" / "data" / "sinirlar"
ILCE_DIZINI = VERI_DIZINI / "ilce"
CIKTI_MAHALLE_DIZINI = VERI_DIZINI / "mahalle"

ISTANBUL_IL_KODU = "34"
TOLERANS_DERECE = 0.0002  # ~20m; mahalle olceginde il/ilce'den (65m) daha ince


# --- Geometri yardimcilari (sinirlari_hazirla.py ile ayni yaklasim) ---


def nokta_dogru_mesafesi(nokta, a, b) -> float:
    (px, py), (ax, ay), (bx, by) = nokta, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    yx, yy = ax + t * dx, ay + t * dy
    return ((px - yx) ** 2 + (py - yy) ** 2) ** 0.5


def douglas_peucker(noktalar, tolerans):
    if len(noktalar) < 3:
        return noktalar
    en_uzak_mesafe = 0.0
    en_uzak_indeks = 0
    for i in range(1, len(noktalar) - 1):
        mesafe = nokta_dogru_mesafesi(noktalar[i], noktalar[0], noktalar[-1])
        if mesafe > en_uzak_mesafe:
            en_uzak_mesafe = mesafe
            en_uzak_indeks = i
    if en_uzak_mesafe <= tolerans:
        return [noktalar[0], noktalar[-1]]
    sol = douglas_peucker(noktalar[: en_uzak_indeks + 1], tolerans)
    sag = douglas_peucker(noktalar[en_uzak_indeks:], tolerans)
    return sol[:-1] + sag


def noktalari_sadelestir(halka):
    acik_halka = halka[:-1] if halka and halka[0] == halka[-1] else halka
    sade = douglas_peucker(acik_halka, TOLERANS_DERECE)
    sonuc = []
    for lon, lat in sade:
        nokta = [round(lon, 5), round(lat, 5)]
        if not sonuc or sonuc[-1] != nokta:
            sonuc.append(nokta)
    if len(sonuc) < 3:
        return acik_halka[:3]
    return sonuc


def dis_halkalar(geometry):
    """Polygon/MultiPolygon farketmeksizin TUM parcalarin dis halkalari."""
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    else:
        polygons = geometry["coordinates"]
    return [polygon[0] for polygon in polygons]


def halka_merkezi(halka):
    xs = [p[0] for p in halka]
    ys = [p[1] for p in halka]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def temsili_nokta(geometry):
    """Mekansal eslestirme icin mahallenin temsili noktasi: en genis dis
    halkanin merkezi (nokta sayisi en fazla olan parca)."""
    halkalar = dis_halkalar(geometry)
    en_genis = max(halkalar, key=len)
    return halka_merkezi(en_genis)


# --- Nokta-poligon (ray casting) ---


def _bbox(halka):
    xs = [p[0] for p in halka]
    ys = [p[1] for p in halka]
    return min(xs), min(ys), max(xs), max(ys)


def _icinde_mi(x, y, halka) -> bool:
    icinde = False
    n = len(halka)
    j = n - 1
    for i in range(n):
        xi, yi = halka[i]
        xj, yj = halka[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            icinde = not icinde
        j = i
    return icinde


def ilce_sinirlarini_yukle():
    """Istanbul ilce sinirlarini (34xxx) mekansal eslestirme icin hazirlar."""
    ilceler = []
    for yol in sorted(glob.glob(str(ILCE_DIZINI / f"{ISTANBUL_IL_KODU}*.json"))):
        d = json.loads(Path(yol).read_text(encoding="utf-8"))
        halkalar = d["noktalar"]
        kutular = [_bbox(h) for h in halkalar]
        genel = (
            min(k[0] for k in kutular),
            min(k[1] for k in kutular),
            max(k[2] for k in kutular),
            max(k[3] for k in kutular),
        )
        ilceler.append(
            {"kod": d["kod"], "ad": d["ad"], "halkalar": halkalar, "kutular": kutular, "genel": genel}
        )
    return ilceler


def ilce_bul(x, y, ilceler):
    for il in ilceler:
        gx0, gy0, gx1, gy1 = il["genel"]
        if not (gx0 <= x <= gx1 and gy0 <= y <= gy1):
            continue
        for halka, (bx0, by0, bx1, by1) in zip(il["halkalar"], il["kutular"]):
            if bx0 <= x <= bx1 and by0 <= y <= by1 and _icinde_mi(x, y, halka):
                return il["kod"]
    return None


def en_yakin_ilce(x, y, ilceler):
    """Hicbir ilcenin icine dusmeyen (kiyi/ada) mahalleler icin yedek: sinir
    kutusu merkezine en yakin ilce."""
    en_iyi = None
    en_kucuk = float("inf")
    for il in ilceler:
        gx0, gy0, gx1, gy1 = il["genel"]
        cx, cy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
        d = (x - cx) ** 2 + (y - cy) ** 2
        if d < en_kucuk:
            en_kucuk = d
            en_iyi = il["kod"]
    return en_iyi


def mahalle_adi(display_name: str) -> str:
    """display_name'in ilk bileseninden mahalle adini cikarir (' Mahallesi' atilir)."""
    ilk = display_name.split(",")[0].strip()
    return re.sub(r"\s*Mahallesi$", "", ilk).strip() or ilk


def kaynagi_onar_ve_yukle():
    """Ham kaynagi (feature'lar arasi virgul eksik olabilir) onarip yukler."""
    ham = KAYNAK.read_text(encoding="utf-8")
    try:
        return json.loads(ham)["features"]
    except json.JSONDecodeError:
        onarik = re.sub(
            r'\}\s*\{\s*"type":\s*"Feature"', '}, {"type": "Feature"', ham
        )
        return json.loads(onarik)["features"]


def main() -> None:
    CIKTI_MAHALLE_DIZINI.mkdir(parents=True, exist_ok=True)
    # Onceki uretimden kalan dosyalari temizle (yeniden uretim tutarli olsun).
    for eski in CIKTI_MAHALLE_DIZINI.glob("*.json"):
        eski.unlink()

    ilceler = ilce_sinirlarini_yukle()
    features = kaynagi_onar_ve_yukle()

    # Once her mahalleyi ilcesine grupla (mekansal eslestirme).
    ilceye_gore: dict[str, list] = {}
    yedekle_atanan = 0
    for f in features:
        x, y = temsili_nokta(f["geometry"])
        ilce_kodu = ilce_bul(x, y, ilceler)
        if ilce_kodu is None:
            ilce_kodu = en_yakin_ilce(x, y, ilceler)
            yedekle_atanan += 1
        ilceye_gore.setdefault(ilce_kodu, []).append(f)

    index = []
    for ilce_kodu, grup in ilceye_gore.items():
        # Ilce icinde ada gore sirala -> kararli, okunabilir sira numaralari.
        grup_sirali = sorted(grup, key=lambda f: mahalle_adi(f["properties"]["display_name"]))
        for i, f in enumerate(grup_sirali, start=1):
            ad = mahalle_adi(f["properties"]["display_name"])
            kod = f"{ilce_kodu}{i:03d}"
            noktalar = [noktalari_sadelestir(h) for h in dis_halkalar(f["geometry"])]
            (CIKTI_MAHALLE_DIZINI / f"{kod}.json").write_text(
                json.dumps(
                    {"kod": kod, "ad": ad, "ilceKodu": ilce_kodu, "noktalar": noktalar},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            index.append({"kod": kod, "ad": ad, "ilceKodu": ilce_kodu})

    index.sort(key=lambda x: (x["ilceKodu"], x["ad"]))
    (VERI_DIZINI / "mahalleler.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8"
    )

    print(
        f"{len(index)} mahalle yazildi ({len(ilceye_gore)} ilce), "
        f"{yedekle_atanan} mahalle 'en yakin ilce' yedegiyle atandi -> {CIKTI_MAHALLE_DIZINI}"
    )


if __name__ == "__main__":
    main()

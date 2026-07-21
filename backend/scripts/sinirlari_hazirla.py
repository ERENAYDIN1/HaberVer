"""Turkiye il/ilce sinir verisini kaynak GeoJSON+CSV dosyalarindan uretir.

Kaynak: https://github.com/ttezer/turkiye-harita-verisi (dist/geojson, dist/csv)
Veri kaynagi HDX COD-AB-TUR snapshot'i, CC BY-IGO. Bkz. backend/app/data/sinirlar/KAYNAK.md

Bu script tek seferlik/manuel calistirilir (runtime'in bir parcasi degildir).
Kaynak dosyalari (ham, ~23MB, git'e girmez) su komutlarla backend/scripts/_kaynak/
altina indirilebilir:

  curl -o backend/scripts/_kaynak/provinces.geojson \
    https://raw.githubusercontent.com/ttezer/turkiye-harita-verisi/master/dist/geojson/provinces.geojson
  curl -o backend/scripts/_kaynak/districts.geojson \
    https://raw.githubusercontent.com/ttezer/turkiye-harita-verisi/master/dist/geojson/districts.geojson
  curl -o backend/scripts/_kaynak/provinces.csv \
    https://raw.githubusercontent.com/ttezer/turkiye-harita-verisi/master/dist/csv/provinces.csv
  curl -o backend/scripts/_kaynak/districts.csv \
    https://raw.githubusercontent.com/ttezer/turkiye-harita-verisi/master/dist/csv/districts.csv
Cikti, repo icine committlenen kucuk/basitlestirilmis dosyalardir:
  backend/app/data/sinirlar/il/<plaka>.json        -> {kod, ad, noktalar}
  backend/app/data/sinirlar/ilce/<ilceKodu>.json   -> {kod, ad, ilKodu, noktalar}
  backend/app/data/sinirlar/iller.json             -> [{kod, ad}]
  backend/app/data/sinirlar/ilceler.json           -> [{kod, ad, ilKodu}]

Basitlestirme: her (Multi)Polygon icin sadece en genis diş halkaya sahip
polygon bileseni alinir (adalar/munferit parcalar goz ardi edilir), koordinatlar
5 ondalige yuvarlanir (~1m). Bu, projede zaten kullanilan "sehir olceginde
yeterince dogru yaklastirma" yaklasimiyla tutarlidir (bkz. utils/geo.ts).
"""

import csv
import json
from pathlib import Path

KAYNAK_DIZIN = Path(__file__).parent / "_kaynak"
CIKTI_DIZIN = Path(__file__).parent.parent / "app" / "data" / "sinirlar"


def halka_alani(halka: list[list[float]]) -> float:
    alan = 0.0
    n = len(halka)
    for i in range(n):
        x1, y1 = halka[i]
        x2, y2 = halka[(i + 1) % n]
        alan += x1 * y2 - x2 * y1
    return abs(alan) / 2


def en_genis_polygon(geometry: dict) -> list[list[float]]:
    """MultiPolygon ise en genis dis halkali polygonu, Polygon ise kendisini dondurur."""
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    else:
        polygons = geometry["coordinates"]

    en_iyi = max(polygons, key=lambda p: halka_alani(p[0]))
    return en_iyi


TOLERANS_DERECE = 0.0006  # ~65m; sehir olceginde gorsel/filtreleme icin yeterli


def nokta_dogru_mesafesi(nokta, a, b) -> float:
    (px, py), (ax, ay), (bx, by) = nokta, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    yx, yy = ax + t * dx, ay + t * dy
    return ((px - yx) ** 2 + (py - yy) ** 2) ** 0.5


def douglas_peucker(noktalar: list[list[float]], tolerans: float) -> list[list[float]]:
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


def noktalari_sadelestir(halka: list[list[float]]) -> list[list[float]]:
    """Kapanis noktasini atar, Douglas-Peucker ile sadelestirir, 5 ondalige yuvarlar."""
    acik_halka = halka[:-1]
    sade = douglas_peucker(acik_halka, TOLERANS_DERECE)
    sonuc: list[list[float]] = []
    for lon, lat in sade:
        nokta = [round(lon, 5), round(lat, 5)]
        if not sonuc or sonuc[-1] != nokta:
            sonuc.append(nokta)
    if len(sonuc) < 3:
        return acik_halka[:3]
    return sonuc


# Kaynak veride yazimi hatali/standart-disi cikan isimler icin duzeltmeler.
# Anahtar ilce kodu (il_kodu + district_local_code), deger dogru yazim.
ILCE_AD_DUZELTMELERI = {
    "34021": "Gaziosmanpaşa",
}


def csv_oku(yol: Path) -> dict[str, dict]:
    with open(yol, encoding="utf-8-sig") as f:
        return {row["id"]: row for row in csv.DictReader(f)}


def main() -> None:
    (CIKTI_DIZIN / "il").mkdir(parents=True, exist_ok=True)
    (CIKTI_DIZIN / "ilce").mkdir(parents=True, exist_ok=True)

    il_csv = csv_oku(KAYNAK_DIZIN / "provinces.csv")
    ilce_csv = csv_oku(KAYNAK_DIZIN / "districts.csv")

    il_geo = json.loads((KAYNAK_DIZIN / "provinces.geojson").read_text(encoding="utf-8"))
    ilce_geo = json.loads((KAYNAK_DIZIN / "districts.geojson").read_text(encoding="utf-8"))

    iller_index = []
    for feature in il_geo["features"]:
        satir = il_csv[feature["properties"]["id"]]
        kod = satir["plate_code"]
        ad = satir["name"]
        polygon = en_genis_polygon(feature["geometry"])
        if len(polygon) > 1:
            print(f"UYARI: {ad} ({kod}) delikli bir poligon, delik atlandi")
        noktalar = noktalari_sadelestir(polygon[0])
        (CIKTI_DIZIN / "il" / f"{kod}.json").write_text(
            json.dumps({"kod": kod, "ad": ad, "noktalar": noktalar}, ensure_ascii=False),
            encoding="utf-8",
        )
        iller_index.append({"kod": kod, "ad": ad})

    iller_index.sort(key=lambda x: x["ad"])
    (CIKTI_DIZIN / "iller.json").write_text(
        json.dumps(iller_index, ensure_ascii=False), encoding="utf-8"
    )

    ilceler_index = []
    for feature in ilce_geo["features"]:
        satir = ilce_csv[feature["properties"]["id"]]
        il_kodu = satir["plate_code"]
        ilce_kodu = f"{il_kodu}{satir['district_local_code']}"
        ad = ILCE_AD_DUZELTMELERI.get(ilce_kodu, satir["name"])
        polygon = en_genis_polygon(feature["geometry"])
        if len(polygon) > 1:
            print(f"UYARI: {ad} ({ilce_kodu}) delikli bir poligon, delik atlandi")
        noktalar = noktalari_sadelestir(polygon[0])
        (CIKTI_DIZIN / "ilce" / f"{ilce_kodu}.json").write_text(
            json.dumps(
                {"kod": ilce_kodu, "ad": ad, "ilKodu": il_kodu, "noktalar": noktalar},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        ilceler_index.append({"kod": ilce_kodu, "ad": ad, "ilKodu": il_kodu})

    ilceler_index.sort(key=lambda x: x["ad"])
    (CIKTI_DIZIN / "ilceler.json").write_text(
        json.dumps(ilceler_index, ensure_ascii=False), encoding="utf-8"
    )

    print(f"{len(iller_index)} il, {len(ilceler_index)} ilce yazildi -> {CIKTI_DIZIN}")


if __name__ == "__main__":
    main()

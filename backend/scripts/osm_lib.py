"""Overpass'tan idari sinir cekme + way->halka dikme + sadelestirme yardimcilari.

`istanbul_sinirlari_osm.py` tarafindan kullanilir. Overpass yanitlari
`_kaynak/osm_cache/` altina onbelleklenir (git'e girmez); boylece flaky/asiri
yuklu public sunuculardan cekim yarida kalirsa betik kaldigi yerden devam eder.
"""
import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Public Overpass aynalari (biri 504/timeout verirse sirayla digerine gecilir).
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]
UA = {"User-Agent": "haberver-boundary-import/1.0 (aydineren1461@gmail.com)"}

CACHE = Path(__file__).parent / "_kaynak" / "osm_cache"


def overpass(query: str, retries: int = 18, use_cache: bool = True) -> dict:
    """Overpass sorgusu calistirir (onbellekli, aynalar arasi yeniden denemeli).
    Bos/hatali (asiri yuk) yanit onbelleklenmez, yeniden denenir."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cf = CACHE / f"{hashlib.md5(query.encode()).hexdigest()}.json"
    if use_cache and cf.exists():
        return json.loads(cf.read_text(encoding="utf-8"))
    data = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for attempt in range(retries):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=240) as r:
                res = json.load(r)
            if not res.get("elements"):
                raise RuntimeError("bos elements (remark: %s)" % str(res.get("remark", ""))[:60])
            if use_cache:
                cf.write_text(json.dumps(res), encoding="utf-8")
            return res
        except Exception as e:  # noqa: BLE001 - aginca her hatada digere gec
            last = e
            sunucu = ep.split("//")[1].split("/")[0]
            print(f"    [dene {attempt+1}/{retries}] {sunucu} -> {type(e).__name__}: {str(e)[:80]}", flush=True)
            time.sleep(min(8 + attempt * 6, 45))
    raise RuntimeError(f"Overpass basarisiz: {last}")


# --- Ring stitching: relation uyelerinden (outer way'ler) kapali halkalar ---


def _key(pt):
    return (round(pt[0], 7), round(pt[1], 7))


def stitch_rings(ways):
    """ways: [[[lon,lat],...], ...] way parcalari. Uc noktalari eslestirerek
    kapali halkalara birlestirir (Overpass 'out geom' relation uyeleri sirali
    gelmez, yon de garantili degildir)."""
    segments = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segments:
        ring = segments.pop(0)
        while _key(ring[0]) != _key(ring[-1]):
            end = _key(ring[-1])
            for i, seg in enumerate(segments):
                if _key(seg[0]) == end:
                    ring.extend(seg[1:]); segments.pop(i); break
                if _key(seg[-1]) == end:
                    ring.extend(list(reversed(seg))[1:]); segments.pop(i); break
            else:
                break  # kapanmadi (eksik parca) - oldugu gibi birak
        rings.append(ring)
    return rings


def members_to_rings(relation: dict):
    """Overpass 'out geom' relation'indan dis (outer) halkalari dondurur;
    ic halkalar (delik, role=inner) atlanir."""
    outer = []
    for m in relation.get("members", []):
        if m.get("type") != "way" or "geometry" not in m:
            continue
        if m.get("role") not in ("outer", "", None):
            continue
        outer.append([[p["lon"], p["lat"]] for p in m["geometry"]])
    return stitch_rings(outer)


# --- Sadelestirme (sinirlari_hazirla.py ile ayni Douglas-Peucker yaklasimi) ---


def _nokta_dogru_mesafesi(nokta, a, b):
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
    en_uzak, idx = 0.0, 0
    for i in range(1, len(noktalar) - 1):
        d = _nokta_dogru_mesafesi(noktalar[i], noktalar[0], noktalar[-1])
        if d > en_uzak:
            en_uzak, idx = d, i
    if en_uzak <= tolerans:
        return [noktalar[0], noktalar[-1]]
    return douglas_peucker(noktalar[: idx + 1], tolerans)[:-1] + douglas_peucker(noktalar[idx:], tolerans)


def signed_area(ring):
    s = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        s += x0 * y1 - x1 * y0
    return s / 2


def sadelestir_halka(halka, tolerans, sarim=None):
    """Kapanis noktasini atar (halkalar acik saklanir), Douglas-Peucker ile
    sadelestirir, 5 ondalige (~1m) yuvarlar. `sarim` verilirse ('cw'/'ccw')
    halka o yone cevrilir - il siniri maske icin CW olmali (bkz. istanbulMaskesi.ts)."""
    acik = halka[:-1] if halka and _key(halka[0]) == _key(halka[-1]) else halka
    sade = douglas_peucker(acik, tolerans)
    sonuc = []
    for lon, lat in sade:
        nokta = [round(lon, 5), round(lat, 5)]
        if not sonuc or sonuc[-1] != nokta:
            sonuc.append(nokta)
    if len(sonuc) < 3:
        sonuc = [[round(p[0], 5), round(p[1], 5)] for p in acik[:3]]
    if sarim:
        cw = signed_area(sonuc) < 0
        if (sarim == "cw" and not cw) or (sarim == "ccw" and cw):
            sonuc.reverse()
    return sonuc

"""Istanbul il/ilce/mahalle sinirlarini OpenStreetMap'ten (Overpass) uretir.

NEDEN: Onceki il/ilce verisi HDX COD-AB-TUR insani-yardim veri setinden
(bkz. sinirlari_hazirla.py) turetiliyordu ve cok kabaydi - bir ilcenin tamami
50-120 noktayla temsil ediliyor, sinirlar altlik haritadan gorunur sekilde
kayiyordu. Bu betik Istanbul'u (il 34 + 39 ilce + ~964 mahalle) dogrudan
OSM'den, ilcenin gercek sinir cizgisiyle (700-4000 nokta) yeniden uretir.
OSM idari-seviye semasi (Turkiye buyuksehir): il=4, ilce=6, MAHALLE=8 (10 degil).

KAPSAM: Yalnizca Istanbul'u gunceller (proje zaten Istanbul'a kilitli). Diger
80 il + 973 ilce icin genel HDX verisi (sinirlari_hazirla.py) yerinde kalir;
backend'in genel /api/sinirlar/il|ilce uclari onlar icin calismaya devam eder.
Ilce kodlari (34001..34039) mevcut HDX kodlariyla AYNI kalir (OSM ilce adi
mevcut ilceler.json adiyla eslestirilerek), boylece mahalle kodu semasi
(<ilceKodu><3 hane>) ve tum referanslar bozulmaz.

KAYNAK/LISANS: OpenStreetMap katkicilari, ODbL 1.0. Proje zaten OSM/Nominatim
kullaniyor, uyumlu. Bkz. backend/app/data/sinirlar/KAYNAK.md.

CIKTI (repoya committlenen kucuk/sadelestirilmis dosyalar):
  il/34.json                          -> {kod, ad, noktalar}
  ilce/34xxx.json  (39 adet)          -> {kod, ad, ilKodu, noktalar}
  mahalle/34xxxYYY.json (~964 adet)   -> {kod, ad, ilceKodu, noktalar}
  mahalleler.json                     -> [{kod, ad, ilceKodu}]  (yalnizca Istanbul)

`noktalar` her zaman bir HALKA LISTESI'dir (`[[[lon,lat],...], ...]`, GeoJSON
MultiPolygon gibi); halkalar ACIK saklanir (kapanis noktasi tekrarlanmaz).
Il siniri maske teknigi icin CW sarima cevrilir (bkz. utils/istanbulMaskesi.ts).

KULLANIM:
  python istanbul_sinirlari_osm.py            # tam uretim (repoya yazar)
  python istanbul_sinirlari_osm.py --dry 34023 34010   # yazmadan nokta sayilari

Overpass public sunuculari flaky/asiri yuklu oldugundan tum yanitlar
_kaynak/osm_cache/'e onbelleklenir; cekim yarida kalirsa betigi tekrar
calistir - kaldigi yerden devam eder (yazma ancak her sey cekilince yapilir).
"""
import json
import sys
import unicodedata
from pathlib import Path

from osm_lib import members_to_rings, overpass, sadelestir_halka

VERI = Path(__file__).parent.parent / "app" / "data" / "sinirlar"
IL_KODU = "34"
IL_REL = 223474  # OSM relation: Istanbul ili (admin_level 4)
IL_AREA = 3600000000 + IL_REL

# Sehir olceginde gorsel/filtreleme icin yeterli, boyutu makul tutan toleranslar.
TOL_IL = 0.0003       # ~33m
TOL_ILCE = 0.00015    # ~16m
TOL_MAHALLE = 0.0001  # ~11m


def norm(s: str) -> str:
    """Ad eslestirme icin: Turkce'yi ASCII'ye indirger, kucultur, boslugu atar."""
    s = (s or "").strip().replace("İ", "i").replace("I", "i").replace("ı", "i")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return s.replace(" ", "")


def istanbul_ilceleri() -> list[dict]:
    """Istanbul'un 39 ilcesini OSM'den ceker: {rel, name}."""
    q = f"""[out:json][timeout:120];
area({IL_AREA})->.ist;
rel(area.ist)[admin_level=6][boundary=administrative];
out ids tags;"""
    res = overpass(q)
    ilceler = [{"rel": e["id"], "name": e.get("tags", {}).get("name")} for e in res["elements"]]
    return sorted(ilceler, key=lambda x: x["name"] or "")


def mevcut_ilce_kod_haritasi() -> dict[str, str]:
    idx = json.loads((VERI / "ilceler.json").read_text(encoding="utf-8"))
    return {norm(x["ad"]): x["kod"] for x in idx if x["ilKodu"] == IL_KODU}


def mahalle_adi(tags: dict) -> str:
    ad = (tags.get("name:tr") or tags.get("name") or "").strip()
    for suf in (" Mahallesi", " Mah.", " Mahalle"):
        if ad.endswith(suf):
            return ad[: -len(suf)].strip()
    return ad


def rel_halkalari(rel: dict, tol: float, sarim=None) -> list[list[list[float]]]:
    return [s for s in (sadelestir_halka(r, tol, sarim=sarim) for r in members_to_rings(rel)) if len(s) >= 3]


def ilce_sorgusu(rel_id: int) -> dict:
    """Tek sorguda: ilce relation geometrisi + o ilcedeki admin_level=8 mahalleler."""
    area = 3600000000 + rel_id
    q = f"""[out:json][timeout:180];
rel({rel_id});out geom;
area({area})->.a;
rel(area.a)[admin_level=8][boundary=administrative];out geom;"""
    return overpass(q)


def ayikla(res: dict, ilce_rel_id: int):
    ilce_rel, mahalle_rels = None, []
    for el in res["elements"]:
        if el["type"] != "relation":
            continue
        if el["id"] == ilce_rel_id:
            ilce_rel = el
        elif el.get("tags", {}).get("admin_level") == "8":
            mahalle_rels.append(el)
    return ilce_rel, mahalle_rels


def main() -> None:
    dry = "--dry" in sys.argv
    hedef = [a for a in sys.argv[1:] if a != "--dry"]

    osm_ilceler = istanbul_ilceleri()
    kod_harita = mevcut_ilce_kod_haritasi()
    eslesmeyen = [oi["name"] for oi in osm_ilceler if not kod_harita.get(norm(oi["name"]))]
    if eslesmeyen:
        print("!! Mevcut kodla eslesmeyen OSM ilcesi (atlanacak):", eslesmeyen)

    # === FAZ A: her seyi onbellege cek (agdan; cokerse tekrar calistir) ===
    if not dry:
        print("FAZ A: OSM'den cekiliyor (onbellekli)...", flush=True)
        overpass(f"[out:json][timeout:120];relation({IL_REL});out geom;")
        for oi in osm_ilceler:
            if kod_harita.get(norm(oi["name"])):
                ilce_sorgusu(oi["rel"])
                print(f"  onbellek OK: {oi['name']}", flush=True)
        print("FAZ A tamam. Yaziliyor...\n", flush=True)

    # === FAZ B: onbellekten uret + yaz ===
    if not dry:
        for eski in (VERI / "mahalle").glob("*.json"):  # eski mahalleler (sayim degisebilir)
            eski.unlink()
        il_rel = overpass(f"[out:json][timeout:120];relation({IL_REL});out geom;")["elements"][0]
        il_halkalar = rel_halkalari(il_rel, TOL_IL, sarim="cw")
        (VERI / "il" / f"{IL_KODU}.json").write_text(
            json.dumps({"kod": IL_KODU, "ad": "İstanbul", "noktalar": il_halkalar}, ensure_ascii=False),
            encoding="utf-8")
        print(f"  il/{IL_KODU}.json: {len(il_halkalar)} halka, {sum(len(h) for h in il_halkalar)} nokta")

    mahalle_index: list[dict] = []
    gorulen: set[int] = set()
    for oi in osm_ilceler:
        kod = kod_harita.get(norm(oi["name"]))
        if not kod or (dry and hedef and kod not in hedef):
            continue
        ilce_rel, mahalle_rels = ayikla(ilce_sorgusu(oi["rel"]), oi["rel"])
        ilce_halkalar = rel_halkalari(ilce_rel, TOL_ILCE)

        mlist = []
        for mr in mahalle_rels:
            if mr["id"] in gorulen:  # sinirda iki ilce alanina birden dusen mahalle
                continue
            gorulen.add(mr["id"])
            ad = mahalle_adi(mr.get("tags", {}))
            if ad:
                mlist.append((ad, mr))
        mlist.sort(key=lambda x: norm(x[0]))

        mnokta = 0
        for i, (ad, mr) in enumerate(mlist, start=1):
            mkod = f"{kod}{i:03d}"
            mhalkalar = rel_halkalari(mr, TOL_MAHALLE)
            mnokta += sum(len(h) for h in mhalkalar)
            if not dry:
                (VERI / "mahalle" / f"{mkod}.json").write_text(
                    json.dumps({"kod": mkod, "ad": ad, "ilceKodu": kod, "noktalar": mhalkalar}, ensure_ascii=False),
                    encoding="utf-8")
            mahalle_index.append({"kod": mkod, "ad": ad, "ilceKodu": kod})

        if not dry:
            (VERI / "ilce" / f"{kod}.json").write_text(
                json.dumps({"kod": kod, "ad": oi["name"], "ilKodu": IL_KODU, "noktalar": ilce_halkalar}, ensure_ascii=False),
                encoding="utf-8")
        print(f"  {kod} {oi['name']:14s}: ilce {sum(len(h) for h in ilce_halkalar):4d} nokta / "
              f"{len(ilce_halkalar)} halka | {len(mlist):2d} mahalle {mnokta} nokta", flush=True)

    if not dry:
        mahalle_index.sort(key=lambda x: (x["ilceKodu"], x["ad"]))
        (VERI / "mahalleler.json").write_text(json.dumps(mahalle_index, ensure_ascii=False), encoding="utf-8")
        print(f"\nToplam {len(mahalle_index)} mahalle -> mahalleler.json")


if __name__ == "__main__":
    main()

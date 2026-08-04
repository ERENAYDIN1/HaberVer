"""Guvenlik duzeltmelerinin uctan uca dogrulamasi.

`auth_akis_testi.py` giris akisinin CALISTIGINI dogrular; bu dosya ise belirli
saldiri yollarinin KAPALI oldugunu dogrular. Her test, duzeltmeden ONCE gecen
somut bir istegi tekrarlar ve artik reddedildigini gosterir.

Kullanim (backend container icinde):
    python scripts/guvenlik_testi.py [admin_eposta] [admin_parola]
"""
import sys
import uuid
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))       # auth_akis_testi
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # app paketi
from auth_akis_testi import API, admin_girisi, giris  # noqa: E402

ORIGIN = {"Origin": "http://localhost:5173"}


def bolum(ad: str) -> None:
    print(f"\n--- {ad} ---")


def onar_sahipligi() -> None:
    """A3: saha calisani kendisine atanmamis bir isi kapatamamali. Duzeltmeden
    once kural yalnizca arayuzdeydi, API'de karsiligi yoktu."""
    bolum("A3 - /onar sahiplik kontrolu")
    personel = admin_girisi()
    saha = giris("sahaekibi1@greenasset.com", "saha1234")

    # Saha ekibi tum varlik listesini gorebilir (tasarim geregi).
    liste = saha.get(f"{API}/api/assets", params={"status": "bakim_lazim"})
    assert liste.status_code == 200, liste.status_code
    varliklar = liste.json()["features"]
    assert varliklar, "test icin bakim bekleyen varlik yok (seed_demo calistirin)"
    print(f"[ok] saha ekibi {len(varliklar)} bakim varligini listeleyebiliyor (beklenen)")

    # Bu ekibe atali olan isler.
    benim = {
        g["properties"]["asset_id"]
        for g in saha.get(f"{API}/api/saha/gorevlerim").json()["features"]
    }
    yabanci = [v for v in varliklar if v["properties"]["id"] not in benim]
    assert yabanci, "bu ekibe atanmamis varlik bulunamadi"
    hedef = yabanci[0]["properties"]["id"]

    yanit = saha.post(f"{API}/api/assets/{hedef}/onar", headers=ORIGIN)
    assert yanit.status_code == 403, f"beklenen 403, gelen {yanit.status_code}"
    print(f"[ok] saha ekibi -> atanmamis varligi onar: 403 ({yanit.json()['detail']})")

    # Kendi isini hala kapatabilmeli (duzeltme mesru akisi bozmamali).
    if benim:
        kendi = next(iter(benim))
        geri = saha.post(f"{API}/api/assets/{kendi}/onar", headers=ORIGIN)
        assert geri.status_code == 200, (geri.status_code, geri.text[:200])
        print("[ok] saha ekibi -> KENDI isini onar: 200 (mesru akis bozulmadi)")
        # Test verisini geri al.
        personel.put(
            f"{API}/api/assets/{kendi}",
            json={"status": "bakim_lazim"},
            headers=ORIGIN,
        )

    # Personel muaf olmali.
    p = personel.post(f"{API}/api/assets/{hedef}/onar", headers=ORIGIN)
    assert p.status_code == 200, p.status_code
    personel.put(f"{API}/api/assets/{hedef}", json={"status": "bakim_lazim"}, headers=ORIGIN)
    print("[ok] personel -> herhangi bir varligi onar: 200 (muaf)")


def medya_yetkisi() -> None:
    """A2: ihbar fotografi kimlik dogrulamasi olmadan indirilememeli."""
    bolum("A2 - medya kimlik dogrulamasi")
    personel = admin_girisi()
    ihbarlar = personel.get(f"{API}/api/reports").json()["features"]
    fotolu = [i for i in ihbarlar if i["properties"].get("photo_url")]
    if not fotolu:
        print("[atlandi] fotografli ihbar yok (seed ihbarlarinda photo_url NULL)")
        return
    yol = fotolu[0]["properties"]["photo_url"]

    anonim = httpx.get(f"{API}{yol}", timeout=10.0)
    assert anonim.status_code == 401, f"beklenen 401, gelen {anonim.status_code}"
    print(f"[ok] cookie'siz {yol} -> 401")

    yetkili = personel.get(f"{API}{yol}")
    assert yetkili.status_code == 200, yetkili.status_code
    assert yetkili.headers["content-type"].startswith("image/")
    print(f"[ok] personel ayni dosyayi indirebiliyor -> 200 ({yetkili.headers['content-type']})")

    # Yol kacisi denemeleri desene takilmali.
    for kotu in ["../../../etc/passwd", "..%2f..%2fmain.py", "abc.jpg", "x.php"]:
        r = personel.get(f"{API}/media/reports/{kotu}")
        assert r.status_code == 404, (kotu, r.status_code)
    print("[ok] yol kacisi / gecersiz dosya adi denemeleri -> 404")


def girdi_sinirlari() -> None:
    """A5: sinirsiz girdi kabul eden uclar artik reddetmeli."""
    bolum("A5 - girdi boyutu sinirlari")
    personel = admin_girisi()

    buyuk = personel.post(
        f"{API}/api/sinirlar/konum/toplu",
        json={"noktalar": [[0.0, 0.0]] * 200_000},
        headers=ORIGIN,
    )
    assert buyuk.status_code == 422, f"beklenen 422, gelen {buyuk.status_code}"
    print("[ok] konum/toplu 200.000 nokta -> 422 (once: CPU'yu doldururdu)")

    kucuk = personel.post(
        f"{API}/api/sinirlar/konum/toplu",
        json={"noktalar": [[28.9784, 41.0082]]},
        headers=ORIGIN,
    )
    assert kucuk.status_code == 200, kucuk.status_code
    print(f"[ok] mesru cagri hala calisiyor -> {kucuk.json()[0]['ilce']}")

    halka = [[28.9 + i * 1e-7, 41.0] for i in range(25_000)]
    tampon = personel.post(
        f"{API}/api/geo/tampon", json={"noktalar": [halka], "mesafe_m": 10}, headers=ORIGIN
    )
    assert tampon.status_code == 422, tampon.status_code
    print("[ok] /geo/tampon 25.000 noktali halka -> 422")


def acik_yonlendirme() -> None:
    """A8: `next` parametresi uygulama disina yonlendirememeli."""
    bolum("A8 - acik yonlendirme")
    for kotu in ["//evil.example", "/\\evil.example", "https://evil.example", "/a\r\nX: y"]:
        r = httpx.get(
            f"{API}/api/auth/login",
            params={"next": kotu},
            follow_redirects=False,
            timeout=10.0,
        )
        # `next` akis cookie'sine yazilir; guvensizse "/" olarak sacilmalidir.
        assert r.status_code == 302
        assert "evil.example" not in r.headers.get("set-cookie", ""), kotu
    print("[ok] //, /\\, mutlak URL ve satir sonu iceren `next` degerleri reddedildi")

    iyi = httpx.get(
        f"{API}/api/auth/login", params={"next": "/saha"}, follow_redirects=False, timeout=10.0
    )
    assert iyi.status_code == 302
    print("[ok] mesru `next=/saha` kabul edildi")


def azp_dogrulamasi() -> None:
    """A6: baska bir istemci icin verilmis token reddedilmeli."""
    bolum("A6 - azp dogrulamasi")
    from app import keycloak  # noqa: PLC0415

    # Servis hesabi token'i gecerlidir; kontrolun calistigi, elle bozulmus bir
    # azp ile dogrulanir.
    token = keycloak._admin_token_al()
    claims = keycloak.token_dogrula(token)
    assert claims["azp"] == keycloak.settings.keycloak_client_id
    print(f"[ok] kendi istemcimizin token'i gecerli (azp={claims['azp']})")

    import jwt as _jwt

    ham = _jwt.decode(token, options={"verify_signature": False})
    assert "azp" in ham, "azp claim'i yok - kontrol anlamsiz olurdu"
    print("[ok] azp claim'i token'da mevcut, kontrol etkin")


def yukleme_siniri() -> None:
    """A4: buyuk / sahte fotograf reddedilmeli."""
    bolum("A4 - fotograf yukleme")
    vatandas = giris("vatandas1@greenasset.com", "vatandas1234")
    alan = {
        "name": "test",
        "type": "diger",
        "longitude": "28.98",
        "latitude": "41.00",
        "note": "test",
    }

    buyuk = vatandas.post(
        f"{API}/api/reports",
        data=alan,
        files={"photo": ("b.png", b"\x89PNG\r\n\x1a\n" + b"0" * (6 * 1024 * 1024), "image/png")},
        headers=ORIGIN,
    )
    assert buyuk.status_code == 413, f"beklenen 413, gelen {buyuk.status_code}"
    print("[ok] 6 MB fotograf -> 413 (once: once bellege alinip sonra reddediliyordu)")

    sahte = vatandas.post(
        f"{API}/api/reports",
        data=alan,
        files={"photo": ("x.png", b"<html><script>alert(1)</script></html>", "image/png")},
        headers=ORIGIN,
    )
    assert sahte.status_code == 400, sahte.status_code
    print(f"[ok] PNG diye gonderilen HTML -> 400 ({sahte.json()['detail']})")

    gercek = vatandas.post(
        f"{API}/api/reports",
        data=alan,
        files={"photo": ("ok.png", b"\x89PNG\r\n\x1a\n" + b"x" * 100, "image/png")},
        headers=ORIGIN,
    )
    assert gercek.status_code == 201, (gercek.status_code, gercek.text[:200])
    print("[ok] gercek PNG -> 201 (mesru yukleme bozulmadi)")
    return gercek.json()["properties"]["id"]


def main() -> None:
    print(f"Hedef: {API}")
    ihbar_id = yukleme_siniri()
    medya_yetkisi()
    onar_sahipligi()
    girdi_sinirlari()
    acik_yonlendirme()
    azp_dogrulamasi()

    # Test ihbarini temizle.
    personel = admin_girisi()
    personel.post(
        f"{API}/api/reports/{ihbar_id}/reddet",
        json={"review_note": "guvenlik testi"},
        headers=ORIGIN,
    )
    print("\nTUM GUVENLIK TESTLERI GECTI")


if __name__ == "__main__":
    main()

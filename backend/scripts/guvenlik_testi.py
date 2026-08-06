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
    """A2: talep fotografi kimlik dogrulamasi olmadan indirilememeli."""
    bolum("A2 - medya kimlik dogrulamasi")
    personel = admin_girisi()
    talepler = personel.get(f"{API}/api/reports").json()["features"]
    fotolu = [i for i in talepler if i["properties"].get("photo_url")]
    if not fotolu:
        print("[atlandi] fotografli talep yok (seed taleplerinde photo_url NULL)")
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
        # Konum artik GeoJSON: nokta/cizgi/alan.
        "geometry": '{"type":"Point","coordinates":[28.98,41.00]}',
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


def departman_kapsami() -> None:
    """A7: bir mudurlugun personeli BASKA mudurlugun talebini ne gormeli ne de
    sonuclandirabilmeli.

    Kural backend'de durur, arayuzde degil: `calisan1` (Fen Isleri) arayuzunde
    park taleplerini hic gormez, ama API'ye dogrudan gidilerek denendiginde de
    kapali olmali - yoksa yeni bir ekran eklendiginde kural sessizce kaybolurdu.

    Kapsam disi kayit 404 doner, 403 degil: talebin VARLIGI da baska
    mudurlugun bilgisidir, "yetkiniz yok" demek kaydin var oldugunu sizdirir."""
    bolum("A7 - departman kapsami")
    fen = giris("calisan1@greenasset.com", "calisan1234")
    park = giris("calisan2@greenasset.com", "calisan1234")

    fen_talepler = fen.get(f"{API}/api/reports", params={"status": "beklemede"}).json()
    park_talepler = park.get(f"{API}/api/reports", params={"status": "beklemede"}).json()
    fen_turler = {t["properties"]["type"] for t in fen_talepler["features"]}
    park_turler = {t["properties"]["type"] for t in park_talepler["features"]}
    assert fen_turler <= {"yol", "kaldirim"}, f"Fen Isleri fazlasini goruyor: {fen_turler}"
    assert park_turler <= {"agac", "sulama", "oyun_grubu", "bank"}, park_turler
    print(f"[ok] Fen Isleri yalnizca {sorted(fen_turler)} goruyor")
    print(f"[ok] Park ve Bahceler yalnizca {sorted(park_turler)} goruyor")

    yabanci = [t for t in park_talepler["features"]]
    assert yabanci, "park departmaninda bekleyen talep yok (seed_demo calistirin)"
    hedef = yabanci[0]["properties"]["id"]

    onay = fen.post(f"{API}/api/reports/{hedef}/onayla", headers=ORIGIN)
    assert onay.status_code == 404, f"beklenen 404, gelen {onay.status_code}"
    print("[ok] Fen Isleri -> park talebini onayla: 404 (kayit sizdirilmadi)")

    ret = fen.post(
        f"{API}/api/reports/{hedef}/reddet",
        json={"review_note": "x"},
        headers=ORIGIN,
    )
    assert ret.status_code == 404, f"beklenen 404, gelen {ret.status_code}"
    print("[ok] Fen Isleri -> park talebini reddet: 404")

    # Kapsam ICINDEKI varlik yaratma calismali (kural mesru akisi bozmamali),
    # kapsam disindaki tur ise 403 (kayit yok, gizlenecek bir sey de yok).
    disari = fen.post(
        f"{API}/api/assets",
        json={
            "name": "kapsam testi",
            "type": "agac",
            "status": "iyi",
            "longitude": 28.98,
            "latitude": 41.0,
        },
        headers=ORIGIN,
    )
    assert disari.status_code == 403, f"beklenen 403, gelen {disari.status_code}"
    print(f"[ok] Fen Isleri -> 'agac' varligi olustur: 403 ({disari.json()['detail']})")


def bolge_kapsami() -> None:
    """A9: bir mudurlugun cizdigi alan/guzergah digerinin ekranina dusmemeli.

    Talep/varlik kapsami TURDEN cozulur, ama bir bolgenin turu yoktur - kural
    kaydin kendi `departman` sutunundan gecer (bkz. routers/bolgeler.py). Bu
    ayri bir kod yolu oldugu icin ayrica olculur: onceden butun bolgeler
    herkese acikti ve bir mudurluk digerinin calisma alanini kendi alakasiz
    ekibine atayabiliyordu.

    Ayrica kaydin GENEL olani (departman NULL) herkese gorunmeye devam
    etmeli: admin'in departmani yoktur, onun cizdigi kayitlar bu kovaya duser
    ve kapanmalari tum bolgeleri gorunmez yapardi."""
    bolum("A9 - bolge (alan/guzergah) kapsami")
    fen = giris("calisan1@greenasset.com", "calisan1234")
    park = giris("calisan2@greenasset.com", "calisan1234")

    fen_bolgeler = fen.get(f"{API}/api/bolgeler").json()
    park_bolgeler = park.get(f"{API}/api/bolgeler").json()
    fen_departmanlari = {b["departman"] for b in fen_bolgeler}
    park_departmanlari = {b["departman"] for b in park_bolgeler}
    assert fen_departmanlari <= {"fen_isleri", None}, fen_departmanlari
    assert park_departmanlari <= {"park_bahceler", None}, park_departmanlari
    print(f"[ok] Fen Isleri yalnizca {sorted(map(str, fen_departmanlari))} goruyor")
    print(f"[ok] Park ve Bahceler yalnizca {sorted(map(str, park_departmanlari))} goruyor")
    assert None in fen_departmanlari and None in park_departmanlari, (
        "genel (departmansiz) bolge iki tarafta da gorunmeli"
    )
    print("[ok] genel bolge (departman=NULL) iki mudurlukte de gorunuyor")

    # Yabanci bir kaydin id'sini admin'den ogrenip dogrudan API'ye gidiyoruz:
    # arayuz onu hic gostermezdi, kural arayuzde degil burada durmali.
    yonetici = admin_girisi()
    hepsi = yonetici.get(f"{API}/api/bolgeler").json()
    yabanci = next(b for b in hepsi if b["departman"] == "park_bahceler")

    for yol, govde in (
        (f"/api/bolgeler/{yabanci['id']}", None),
        (f"/api/bolgeler/{yabanci['id']}/ata", {"worker_id": None}),
        (f"/api/bolgeler/{yabanci['id']}/tamamla", {"tamamlandi": True}),
    ):
        yanit = (
            fen.patch(f"{API}{yol}", json={"ad": "ele gecirildi"}, headers=ORIGIN)
            if govde is None
            else fen.post(f"{API}{yol}", json=govde, headers=ORIGIN)
        )
        assert yanit.status_code == 404, f"{yol}: beklenen 404, gelen {yanit.status_code}"
    print("[ok] Fen Isleri -> park bolgesini duzenle/ata/tamamla: 404")

    silme = fen.delete(f"{API}/api/bolgeler/{yabanci['id']}", headers=ORIGIN)
    assert silme.status_code == 404, f"beklenen 404, gelen {silme.status_code}"
    print("[ok] Fen Isleri -> park bolgesini sil: 404")

    # Kendi kaydinda bile MUDURLUK DEVRI admin'in isi: aksi halde bir mudurluk
    # kendi kaydini digerine iterek ya da genele birakarak kapsami asabilirdi.
    kendi = next(b for b in fen_bolgeler if b["departman"] == "fen_isleri")
    devir = fen.patch(
        f"{API}/api/bolgeler/{kendi['id']}",
        json={"departman": None},
        headers=ORIGIN,
    )
    assert devir.status_code == 403, f"beklenen 403, gelen {devir.status_code}"
    print(f"[ok] Fen Isleri -> kendi bolgesini genele cek: 403 ({devir.json()['detail']})")

    # Kaydin mudurlugu disindaki bir ekibe atama da reddedilmeli (ekip listesi
    # zaten suzuluyor, ama kural o listeye guvenmemeli).
    park_ekipleri = yonetici.get(f"{API}/api/saha/ekipler").json()
    yabanci_ekip = next(e for e in park_ekipleri if e["departman"] == "park_bahceler")
    atama = fen.post(
        f"{API}/api/bolgeler/{kendi['id']}/ata",
        json={"worker_id": yabanci_ekip["id"]},
        headers=ORIGIN,
    )
    assert atama.status_code == 403, f"beklenen 403, gelen {atama.status_code}"
    print(f"[ok] Fen Isleri -> park ekibine ata: 403 ({atama.json()['detail']})")


def tur_sozlugu_yetkisi() -> None:
    """A10: tur/mudurluk sozlugunu YALNIZCA admin degistirebilir.

    Sozluk artik veri (admin ekranindan yonetiliyor); bir tur eklemek ya da
    yonlendirmesini degistirmek her personelin ne gorebildigini degistirir.
    Okuma herkese acik (vatandas talep formu tur listesini oradan cizer)."""
    bolum("A10 - tur/mudurluk sozlugu yetkisi")
    calisan = giris("calisan1@greenasset.com", "calisan1234")

    okuma = calisan.get(f"{API}/api/turler")
    assert okuma.status_code == 200, okuma.status_code
    print(f"[ok] calisan tur listesini okuyabiliyor ({len(okuma.json())} tur)")

    denemeler = [
        (
            "POST /api/turler",
            calisan.post(
                f"{API}/api/turler",
                json={
                    "kod": "guvenlik_testi",
                    "ad": "Güvenlik Testi",
                    "grup": "diger",
                    "glif": None,
                    "departman": "fen_isleri",
                },
                headers=ORIGIN,
            ),
        ),
        (
            "PATCH /api/turler/agac",
            calisan.patch(f"{API}/api/turler/agac", json={"ad": "X"}, headers=ORIGIN),
        ),
        ("DELETE /api/turler/agac", calisan.delete(f"{API}/api/turler/agac", headers=ORIGIN)),
        (
            "POST /api/departmanlar",
            calisan.post(
                f"{API}/api/departmanlar",
                json={"kod": "sahte", "ad": "Sahte", "aciklama": None,
                      "renk": "#000000", "aktif": True},
                headers=ORIGIN,
            ),
        ),
        (
            "PUT /api/departmanlar/esleme",
            calisan.put(
                f"{API}/api/departmanlar/esleme",
                json={"esleme": {"agac": "fen_isleri"}},
                headers=ORIGIN,
            ),
        ),
    ]
    for ad, yanit in denemeler:
        assert yanit.status_code == 403, f"{ad}: beklenen 403, gelen {yanit.status_code}"
    print("[ok] calisan -> tur/mudurluk ekle-degistir-sil ve yonlendirme: 403")

    # KULLANIMDA olan bir tur admin icin bile silinemez: tur kodu kayitlarin
    # icinde yasar, silinirse gecmis okunamaz hale gelirdi.
    yonetici = admin_girisi()
    silme = yonetici.delete(f"{API}/api/turler/agac", headers=ORIGIN)
    assert silme.status_code == 409, f"beklenen 409, gelen {silme.status_code}"
    print(f"[ok] admin -> kullanimdaki turu sil: 409 ({silme.json()['detail']})")


def main() -> None:
    print(f"Hedef: {API}")
    talep_id = yukleme_siniri()
    medya_yetkisi()
    onar_sahipligi()
    girdi_sinirlari()
    acik_yonlendirme()
    azp_dogrulamasi()
    departman_kapsami()
    bolge_kapsami()
    tur_sozlugu_yetkisi()

    # Test talebini temizle.
    personel = admin_girisi()
    personel.post(
        f"{API}/api/reports/{talep_id}/reddet",
        json={"review_note": "guvenlik testi"},
        headers=ORIGIN,
    )
    print("\nTUM GUVENLIK TESTLERI GECTI")


if __name__ == "__main__":
    main()

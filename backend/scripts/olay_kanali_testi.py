"""Canli guncelleme kanali (SSE) uctan uca testi.

Olculen sey "uc 200 donuyor mu" degil, SOZLESME: bir mutasyon yapildiginda
kanaldan ILGILI anahtarin sinyali geliyor mu, ve sinyal veri tasimiyor mu
(icinde yalnizca anahtar adi olmali - kapsam kurallari uclarda kalsin diye).

Kullanim (backend container icinde):
    python scripts/olay_kanali_testi.py [email] [parola]
"""
import json
import sys
import threading
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from auth_akis_testi import API, admin_girisi  # noqa: E402

# Sinyalin gelmesi icin beklenecek en fazla sure (sn). Kanal surec ici
# oldugundan gecikme milisaniyelerle olculur; bu yalnizca askida kalmamak icin.
ZAMAN_ASIMI = 10

# Guvensiz metotlar Origin dogrulamasindan gecer (main.py::origin_kontrolu);
# diger test script'leriyle ayni konvansiyon.
ORIGIN = {"Origin": "http://localhost:5173"}


class Dinleyici:
    """SSE akisini ayri bir is parcaciginda okuyup olaylari biriktirir."""

    def __init__(self, cookies):
        self.cookies = cookies
        self.olaylar: list[str] = []
        self.hazir = threading.Event()
        self._dur = False
        self._is = threading.Thread(target=self._oku, daemon=True)

    def basla(self):
        self._is.start()
        # Ilk paket (": baglandi") gelene kadar bekle - aksi halde test,
        # abonelik kurulmadan mutasyon yapip sinyali kacirabilir.
        if not self.hazir.wait(timeout=ZAMAN_ASIMI):
            raise AssertionError("Kanal acilmadi")

    def _oku(self):
        with httpx.Client(cookies=self.cookies, timeout=None) as c:
            with c.stream("GET", f"{API}/api/olaylar") as r:
                assert r.status_code == 200, f"kanal acilamadi: {r.status_code}"
                tip = r.headers.get("content-type", "")
                assert "text/event-stream" in tip, f"beklenmeyen tip: {tip}"
                veri = None
                for satir in r.iter_lines():
                    if self._dur:
                        return
                    if satir.startswith(":"):
                        self.hazir.set()  # yorum satiri = baglanti kuruldu
                    elif satir.startswith("data:"):
                        veri = satir[5:].strip()
                    elif satir == "" and veri is not None:
                        self.olaylar.append(veri)
                        veri = None

    def bekle(self, anahtar: str) -> dict:
        """Verilen anahtarin sinyalini bekler ve govdesini dondurur."""
        son = time.time() + ZAMAN_ASIMI
        while time.time() < son:
            for ham in list(self.olaylar):
                govde = json.loads(ham)
                if govde.get("anahtar") == anahtar:
                    return govde
            time.sleep(0.05)
        raise AssertionError(
            f"'{anahtar}' sinyali {ZAMAN_ASIMI} sn icinde gelmedi; "
            f"gelenler: {self.olaylar}"
        )

    def dur(self):
        self._dur = True


def main() -> int:
    istemci = admin_girisi()
    print("[ok] admin girisi")

    dinleyici = Dinleyici(istemci.cookies)
    dinleyici.basla()
    print("[ok] SSE kanali acildi (text/event-stream)")

    # `giris` zaten ACIK bir istemci dondurur; `with` ikinci kez acamaz.
    c = istemci
    try:
        # --- Bir bolge olustur: 'bolgeler' + 'saha' sinyali beklenir ---
        yeni = c.post(
            f"{API}/api/bolgeler",
            json={
                "ad": "Olay kanali testi",
                "tip": "alan",
                "renk": "#7c3aed",
                "noktalar": [
                    [[28.90, 41.00], [28.91, 41.00], [28.91, 41.01], [28.90, 41.00]]
                ],
            },
            headers=ORIGIN,
        )
        assert yeni.status_code == 201, f"bolge olusturulamadi: {yeni.text}"
        bolge_id = yeni.json()["id"]
        try:
            govde = dinleyici.bekle("bolgeler")
            print(f"[ok] olusturma -> 'bolgeler' sinyali geldi: {govde}")
            assert set(govde.keys()) == {"anahtar"}, (
                f"sinyal VERI TASIMAMALI, yalnizca anahtar: {govde}"
            )
            print("[ok] sinyal veri tasimiyor (yalnizca anahtar)")
            dinleyici.bekle("saha")
            print("[ok] olusturma -> 'saha' sinyali de geldi (ortak kota)")

            # --- Silme de sinyal uretmeli ---
            dinleyici.olaylar.clear()
            silme = c.delete(f"{API}/api/bolgeler/{bolge_id}", headers=ORIGIN)
            assert silme.status_code == 204, f"silinemedi: {silme.status_code}"
            dinleyici.bekle("bolgeler")
            print("[ok] silme -> 'bolgeler' sinyali geldi")
            bolge_id = None
        finally:
            if bolge_id:
                c.delete(f"{API}/api/bolgeler/{bolge_id}", headers=ORIGIN)
    finally:
        c.close()

    dinleyici.dur()
    print("\nTUM ADIMLAR BASARILI")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as e:
        print(f"\nBASARISIZ: {e}")
        sys.exit(1)

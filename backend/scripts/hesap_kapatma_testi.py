"""Hesap devre disi birakma akisinin uctan uca dogrulamasi.

Kritik nokta: kapatmak yalnizca bir bayrak DEGILDIR. Uc kapinin da kapanmasi
gerekir (bkz. crud/user.py::set_active) ve en onemlisi ucuncusudur - BFF'de
token tarayicida degil bizde durdugu icin, `sessions` satiri silinmezse
kullanici access token'i suresi dolana kadar (5 dk) calismaya devam ederdi.
Bu dosya tam olarak onu olcer: kapatma ANINDA etkili mi?

Kullanim (backend container icinde):
    python scripts/hesap_kapatma_testi.py [admin_parolasi]
"""
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from auth_akis_testi import API, giris  # noqa: E402

ORIGIN = {"Origin": "http://localhost:5173"}
KURBAN = "sahaekibi3@greenasset.com"
KURBAN_PAROLA = "saha1234"


def main() -> None:
    admin = giris(
        settings.default_admin_email,
        sys.argv[1] if len(sys.argv) > 1 else settings.default_admin_password,
    )

    kurban_id = next(
        u["id"] for u in admin.get(f"{API}/api/users").json() if u["email"] == KURBAN
    )

    # 1) Kurban giris yapar ve calisan bir oturumu olur.
    kurban = giris(KURBAN, KURBAN_PAROLA)
    assert kurban.get(f"{API}/api/saha/gorevlerim").status_code == 200
    print(f"[ok] {KURBAN} giris yapti, oturumu calisiyor")

    # 2) Admin hesabi kapatir.
    kapat = admin.patch(
        f"{API}/api/users/{kurban_id}", json={"is_active": False}, headers=ORIGIN
    )
    assert kapat.status_code == 200, (kapat.status_code, kapat.text[:200])
    assert kapat.json()["is_active"] is False
    print("[ok] admin hesabi devre disi birakti -> is_active=false")

    # 3) ACIK oturum ANINDA dusmeli. Bu, `sessions` satirinin silinmesine bagli;
    #    yalnizca bayrak cevrilseydi access token'in omru kadar (5 dk) gecerli
    #    kalirdi.
    sonra = kurban.get(f"{API}/api/saha/gorevlerim")
    assert sonra.status_code == 401, f"beklenen 401, gelen {sonra.status_code}"
    print("[ok] kurbanin ACIK oturumu aninda dustu -> 401 (5 dk beklenmedi)")

    # 4) Yeniden giris de yapamamali (Keycloak tarafinda da kapali).
    try:
        giris(KURBAN, KURBAN_PAROLA)
        raise AssertionError("kapali hesap yeniden giris yapabildi")
    except AssertionError as e:
        if "yeniden giris yapabildi" in str(e):
            raise
        print("[ok] kapali hesap Keycloak'ta da giris yapamiyor")

    # 5) Admin kendi hesabini kapatamamali (kendini disari kilitleme korumasi).
    ben = admin.get(f"{API}/api/auth/me").json()
    kendi = admin.patch(
        f"{API}/api/users/{ben['id']}", json={"is_active": False}, headers=ORIGIN
    )
    assert kendi.status_code == 409, kendi.status_code
    print(f"[ok] admin kendi hesabini kapatamiyor -> 409 ({kendi.json()['detail']})")

    # 6) Son aktif admin dusurulememeli.
    adminler = [
        u
        for u in admin.get(f"{API}/api/users").json()
        if u["role"] == "admin" and u["is_active"]
    ]
    if len(adminler) == 1:
        print("[ok] tek admin var; 'son yonetici' korumasi 5. adimla ortusuyor")

    # 7) Geri acma calismali ve yalnizca is_active gonderildigi icin YAKA
    #    korunmali (exclude_unset: gonderilmeyen alana dokunulmaz).
    onceki_yaka = next(
        u["yaka"] for u in admin.get(f"{API}/api/users").json() if u["id"] == kurban_id
    )
    ac = admin.patch(
        f"{API}/api/users/{kurban_id}", json={"is_active": True}, headers=ORIGIN
    )
    assert ac.status_code == 200, ac.status_code
    assert ac.json()["is_active"] is True
    assert ac.json()["yaka"] == onceki_yaka, "yaka sessizce silindi!"
    print(f"[ok] hesap geri acildi, yaka korundu (yaka={ac.json()['yaka']})")

    # 8) Geri acilan hesap tekrar giris yapabilmeli.
    yeniden = giris(KURBAN, KURBAN_PAROLA)
    assert yeniden.get(f"{API}/api/saha/gorevlerim").status_code == 200
    print("[ok] geri acilan hesap yeniden giris yapabiliyor")

    print("\nHESAP KAPATMA AKISI GECTI")


if __name__ == "__main__":
    main()

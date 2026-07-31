"""Uctan uca giris akisi testi (tarayici olmadan).

Gercek OIDC akisinin tum adimlarini gecer: /api/auth/login -> Keycloak giris
formu -> kod -> /api/auth/callback -> oturum cookie'si -> /api/auth/me.
Ayrica cookie'siz erisimin 401, yanlis rolun 403 verdigini ve cikisin yalnizca
yerel oturumu degil Keycloak SSO oturumunu da kapattigini dogrular.

Kullanim (backend container icinde):
    python scripts/auth_akis_testi.py [email] [parola]
"""
import re
import sys

import httpx

API = "http://localhost:8000"
# Keycloak'in urettigi mutlak adresler tarayici icindir (localhost:8081);
# container icinden ag adiyla gideriz.
PUBLIC = "http://localhost:8081"
INTERNAL = "http://keycloak:8080"


def ic(url: str) -> str:
    return url.replace(PUBLIC, INTERNAL)


def giris(email: str, parola: str) -> httpx.Client:
    istemci = httpx.Client(follow_redirects=False, timeout=15.0)

    # 1) Uygulama, akis cookie'sini yazar ve Keycloak'a yonlendirir.
    yanit = istemci.get(f"{API}/api/auth/login", params={"next": "/"})
    assert yanit.status_code == 302, yanit.status_code
    kc_url = yanit.headers["location"]
    assert "/protocol/openid-connect/auth" in kc_url, kc_url
    assert "greenasset_flow" in yanit.headers.get("set-cookie", ""), "akis cookie yok"

    # 2) Keycloak giris formu.
    form_sayfa = istemci.get(ic(kc_url))
    eslesme = re.search(r'action="([^"]+)"', form_sayfa.text)
    assert eslesme, "giris formu bulunamadi"
    action = eslesme.group(1).replace("&amp;", "&")

    # 3) Kimlik bilgileri -> kod.
    gonderim = istemci.post(
        ic(action),
        data={"username": email, "password": parola},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert gonderim.status_code in (302, 303), (gonderim.status_code, gonderim.text[:400])
    donus = gonderim.headers["location"]
    assert "code=" in donus, donus

    # 4) Callback: kod token'a cevrilir, oturum cookie'si yazilir.
    #    (Tarayici burayi 5173 uzerinden cagirir; ayni uc, ayni cookie.)
    cb = istemci.get(f"{API}{donus.split('localhost:5173', 1)[1]}")
    assert cb.status_code == 302, (cb.status_code, cb.text[:400])
    assert "greenasset_session" in cb.headers.get("set-cookie", ""), "oturum cookie yok"
    return istemci


def main() -> None:
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@greenasset.com"
    parola = sys.argv[2] if len(sys.argv) > 2 else "admin1234"

    # Cookie'siz erisim reddedilmeli.
    anonim = httpx.get(f"{API}/api/auth/me", timeout=10.0)
    assert anonim.status_code == 401, anonim.status_code
    print("[ok] cookie'siz /auth/me -> 401")

    istemci = giris(email, parola)

    me = istemci.get(f"{API}/api/auth/me")
    assert me.status_code == 200, (me.status_code, me.text[:300])
    print(f"[ok] giris: {me.json()['email']} / rol={me.json()['role']}")

    oturum = istemci.get(f"{API}/api/auth/oturum")
    print(
        f"[ok] etkin rol: {oturum.json()['etkin_rol']} "
        f"(ham roller: {oturum.json()['roller']})"
    )

    korumali = istemci.get(f"{API}/api/assets")
    print(f"[ok] korumali uc /api/assets -> {korumali.status_code}")

    # Rol ayrimi: realm'in default bilesigi HERKESE `vatandas` rolu verdigi
    # icin ham listede o da var; yetki karari tek etkin role gore verilmeli,
    # yani admin vatandas ucuna girememeli.
    vatandas_ucu = istemci.get(f"{API}/api/reports/mine")
    assert vatandas_ucu.status_code == 403, vatandas_ucu.status_code
    print("[ok] admin -> vatandas ucu (/reports/mine) 403")

    # Ters yon: vatandas hesabi personel ucuna girememeli.
    vatandas = giris("vatandas1@greenasset.com", "vatandas1234")
    assert vatandas.get(f"{API}/api/reports/mine").status_code == 200
    assert vatandas.get(f"{API}/api/saha/ekipler").status_code == 403
    print("[ok] vatandas -> kendi ucu 200, personel ucu 403")

    # CSRF: Origin basligi yanlissa yazma islemi reddedilmeli.
    csrf = istemci.post(
        f"{API}/api/saha/konum",
        json={"longitude": 29.0, "latitude": 41.0},
        headers={"Origin": "http://kotu-site.example"},
    )
    assert csrf.status_code == 403, csrf.status_code
    print("[ok] yabanci Origin ile POST -> 403")

    cikis = istemci.post(f"{API}/api/auth/logout", headers={"Origin": "http://localhost:5173"})
    assert cikis.status_code == 200, cikis.status_code
    assert "/protocol/openid-connect/logout" in cikis.json()["cikis_url"]
    print("[ok] cikis: yerel oturum silindi, Keycloak cikis adresi dondu")

    sonra = istemci.get(f"{API}/api/auth/me")
    assert sonra.status_code == 401, sonra.status_code
    print("[ok] cikistan sonra /auth/me -> 401")

    # Yerel oturumun silinmesi YETMEZ: cikis adresi gercekten izlenmezse
    # Keycloak SSO oturumu ayakta kalir ve bir sonraki /auth/login formu hic
    # gostermeden kod verir - kullanici "cikamamis" olur. Olcut: giris formu.
    # follow_redirects=False, cunku cikisin son duragi tarayiciya ait
    # http://localhost:5173/giris ve container icinden erisilemez.
    istemci.get(ic(cikis.json()["cikis_url"]))
    tekrar = istemci.get(f"{API}/api/auth/login", params={"next": "/"})
    kc = istemci.get(ic(tekrar.headers["location"]))
    assert 'name="password"' in kc.text, "SSO oturumu kapanmamis (sessiz giris)"
    print("[ok] cikis adresi izlenince Keycloak SSO oturumu da kapaniyor")


if __name__ == "__main__":
    main()

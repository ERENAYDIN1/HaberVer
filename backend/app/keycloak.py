"""Keycloak ile konusan tek modul: yetkilendirme kodu akisi, token yenileme,
ID token dogrulama (JWKS) ve kullanici yonetimi icin Admin API.

Tasarim notlari:

* **Iki adres.** Tarayici Keycloak'a `KEYCLOAK_PUBLIC_URL` uzerinden gider
  (yonlendirme, giris ekrani); backend ise docker agi icinden
  `KEYCLOAK_INTERNAL_URL`'e gider. Token'daki `iss` her zaman PUBLIC adrestir,
  dogrulama da ona gore yapilir. Uc adresleri bu yuzden OIDC kesif belgesinden
  okunmaz - kesif tek bir hostname dondurur ve iki taraftan biri hep yanlis
  olurdu.
* **Token tarayiciya hic gitmez** (BFF): kod degisimi burada yapilir, token'lar
  oturum satirinda kalir. Bu yuzden `client_secret` ile "confidential" istemci
  kullanilir, PKCE de ayrica uygulanir.
"""

from __future__ import annotations

import base64
import hashlib
import os
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import jwt
from jwt import PyJWKClient

from .config import settings


class KeycloakHatasi(RuntimeError):
    """Keycloak'a yapilan bir cagri basarisiz oldu (ag, yetki, dogrulama)."""


def _public(yol: str) -> str:
    return f"{settings.keycloak_public_url.rstrip('/')}/realms/{settings.keycloak_realm}{yol}"


def _internal(yol: str) -> str:
    return f"{settings.keycloak_internal_url.rstrip('/')}/realms/{settings.keycloak_realm}{yol}"


def _admin(yol: str) -> str:
    return f"{settings.keycloak_internal_url.rstrip('/')}/admin/realms/{settings.keycloak_realm}{yol}"


ISSUER = _public("")
REDIRECT_URI = f"{settings.app_base_url.rstrip('/')}/api/auth/callback"

# JWKS istemcisi anahtarlari onbellekler; anahtar donunce (kid degisince)
# kendisi yeniden ceker.
_jwk_client = PyJWKClient(_internal("/protocol/openid-connect/certs"))


# --- Yetkilendirme kodu akisi ------------------------------------------------


def pkce_uret() -> tuple[str, str]:
    """(verifier, challenge) ciftini uretir. Verifier oturum akisi cookie'sinde
    saklanir, challenge Keycloak'a gider - araya giren bir taraf kodu ele
    gecirse bile verifier'i bilmedigi icin token alamaz."""
    verifier = base64.urlsafe_b64encode(os.urandom(64)).decode().rstrip("=")
    ozet = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(ozet).decode().rstrip("=")
    return verifier, challenge


def giris_url(state: str, nonce: str, challenge: str, kayit: bool = False) -> str:
    """Tarayicinin yonlendirilecegi Keycloak adresi. `kayit=True` ise dogrudan
    kayit ekrani acilir (vatandas oz-kaydi Keycloak'in kendi formundadir)."""
    sorgu = urlencode(
        {
            "client_id": settings.keycloak_client_id,
            "response_type": "code",
            "scope": "openid profile email",
            "redirect_uri": REDIRECT_URI,
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    uc = "registrations" if kayit else "auth"
    return _public(f"/protocol/openid-connect/{uc}?{sorgu}")


def cikis_url(id_token: str | None, donus: str) -> str:
    """RP-initiated logout: Keycloak oturumunu da kapatir. `id_token` verilirse
    kullaniciya "cikmak istedigine emin misin" ekrani gosterilmez."""
    parametre: dict[str, str] = {"post_logout_redirect_uri": donus}
    if id_token:
        parametre["id_token_hint"] = id_token
    else:
        parametre["client_id"] = settings.keycloak_client_id
    return _public(f"/protocol/openid-connect/logout?{urlencode(parametre)}")


@dataclass
class TokenSeti:
    access_token: str
    refresh_token: str | None
    id_token: str | None
    expires_in: int
    claims: dict


def _token_iste(veri: dict) -> TokenSeti:
    veri = {
        **veri,
        "client_id": settings.keycloak_client_id,
        "client_secret": settings.keycloak_client_secret,
    }
    try:
        yanit = httpx.post(
            _internal("/protocol/openid-connect/token"), data=veri, timeout=10.0
        )
    except httpx.HTTPError as e:  # ag hatasi
        raise KeycloakHatasi(f"Keycloak'a ulasilamadi: {e}") from e
    if yanit.status_code != 200:
        raise KeycloakHatasi(f"Token alinamadi ({yanit.status_code}): {yanit.text}")
    govde = yanit.json()
    # Iddialari ACCESS token'dan okuruz: rol eslemesi hem access hem id token'a
    # yaziliyor, ama yenilemeden sonra id_token her zaman geri gelmez.
    return TokenSeti(
        access_token=govde["access_token"],
        refresh_token=govde.get("refresh_token"),
        id_token=govde.get("id_token"),
        expires_in=int(govde.get("expires_in", 300)),
        claims=token_dogrula(govde["access_token"]),
    )


def kod_degistir(kod: str, verifier: str) -> TokenSeti:
    return _token_iste(
        {
            "grant_type": "authorization_code",
            "code": kod,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": verifier,
        }
    )


def token_yenile(refresh_token: str) -> TokenSeti:
    """Access token'i yeniler. Keycloak tarafinda oturum sonlandirilmissa
    (cikis, hesap kapatma, admin iptali) burasi hata verir - iptalin bize
    yansidigi nokta budur."""
    return _token_iste(
        {"grant_type": "refresh_token", "refresh_token": refresh_token}
    )


def token_dogrula(token: str) -> dict:
    """Imza (JWKS), issuer, sure ve `azp` dogrulanmis iddialar. Algoritma acikca
    RS256'ya sabitlenir: `alg` alanina guvenmek klasik bir aciktir."""
    try:
        anahtar = _jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            anahtar.key,
            algorithms=["RS256"],
            issuer=ISSUER,
            # Keycloak access token'inin `aud` degeri istemciye gore degisir
            # (cogu kurulumda "account"), bu yuzden `aud` yerine ASAGIDA `azp`
            # dogrulanir.
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as e:
        raise KeycloakHatasi(f"Token dogrulanamadi: {e}") from e

    # `azp` (authorized party) = token'in HANGI ISTEMCI icin verildigi. Bu
    # kontrol daha once yalnizca yorumda vaat ediliyordu, kodda yoktu: ayni
    # realm'deki BASKA bir istemcinin cikardigi token da imza + issuer
    # kontrolunden gecerdi. BFF'de token'lari kendimiz aldigimiz icin bugun
    # somurulebilir degil, ama realm'e ikinci bir istemci eklendigi an gercek
    # bir aciga donusurdu - ve o an kimse bu satiri hatirlamazdi.
    if claims.get("azp") != settings.keycloak_client_id:
        raise KeycloakHatasi("Token baska bir istemci icin verilmis (azp uyusmuyor)")
    return claims


def rolleri_oku(claims: dict) -> list[str]:
    """Realm rollerini iddialardan cikarir. Ozel eslememiz `roles` claim'ini
    yaziyor; olmazsa Keycloak'in standart `realm_access.roles` alanina duseriz."""
    roller = claims.get("roles")
    if isinstance(roller, list):
        return [str(r) for r in roller]
    return [str(r) for r in claims.get("realm_access", {}).get("roles", [])]


# --- Admin API (personel hesabi acma / kapatma) ------------------------------

_admin_token: tuple[str, float] | None = None


def _admin_token_al() -> str:
    """Servis hesabinin token'i (client_credentials). Suresi dolmadan
    onbellekten kullanilir."""
    global _admin_token
    if _admin_token and _admin_token[1] > time.time() + 10:
        return _admin_token[0]
    try:
        yanit = httpx.post(
            _internal("/protocol/openid-connect/token"),
            data={
                "grant_type": "client_credentials",
                "client_id": settings.keycloak_client_id,
                "client_secret": settings.keycloak_client_secret,
            },
            timeout=10.0,
        )
    except httpx.HTTPError as e:
        raise KeycloakHatasi(f"Keycloak'a ulasilamadi: {e}") from e
    if yanit.status_code != 200:
        raise KeycloakHatasi(f"Servis hesabi token'i alinamadi: {yanit.text}")
    govde = yanit.json()
    _admin_token = (govde["access_token"], time.time() + int(govde["expires_in"]))
    return _admin_token[0]


def _admin_istek(method: str, yol: str, **kwargs) -> httpx.Response:
    try:
        return httpx.request(
            method,
            _admin(yol),
            headers={"Authorization": f"Bearer {_admin_token_al()}"},
            timeout=10.0,
            **kwargs,
        )
    except httpx.HTTPError as e:
        raise KeycloakHatasi(f"Keycloak'a ulasilamadi: {e}") from e


def kullanici_bul(email: str) -> dict | None:
    yanit = _admin_istek("GET", "/users", params={"email": email, "exact": "true"})
    if yanit.status_code != 200:
        raise KeycloakHatasi(f"Kullanici aranamadi: {yanit.text}")
    liste = yanit.json()
    return liste[0] if liste else None


def _ad_temizle(full_name: str | None) -> str:
    """Keycloak'in kisi adi dogrulamasindan gececek hale getirir: harf, bosluk,
    tire ve kesme isareti disindaki karakterler atilir (`error-person-name-
    invalid-character`). Parantezli aciklamalar - ornegin "Saha Ekibi 1
    (Kadikoy)" - bu yuzden temizlenir; YEREL kayitta ad oldugu gibi kalir,
    yalnizca Keycloak'a giden kopya sadelestirilir."""
    if not full_name:
        return ""
    temiz = "".join(k for k in full_name if k.isalpha() or k in " -'")
    return " ".join(temiz.split())


def kullanici_olustur(
    *, email: str, parola: str, full_name: str | None, rol: str
) -> str:
    """Keycloak'ta bir kullanici acar ve realm rolunu atar; kullanici id'sini
    (yerel satirdaki `keycloak_id`) dondurur. Hesap zaten varsa mevcut id
    dondurulur ve rolu guncellenir - script'lerin tekrar calistirilabilmesi
    (idempotentlik) icin."""
    ad, _, soyad = _ad_temizle(full_name).partition(" ")
    govde = {
        "username": email,
        "email": email,
        "emailVerified": True,
        "enabled": True,
        "firstName": ad or None,
        "lastName": soyad or None,
        "credentials": [{"type": "password", "value": parola, "temporary": False}],
    }
    yanit = _admin_istek("POST", "/users", json=govde)
    if yanit.status_code == 409:
        mevcut = kullanici_bul(email)
        if mevcut is None:
            raise KeycloakHatasi("Kullanici cakisti ama bulunamadi")
        kullanici_id = mevcut["id"]
    elif yanit.status_code == 201:
        # Keycloak yeni kaydin id'sini Location basliginda dondurur.
        kullanici_id = yanit.headers["Location"].rsplit("/", 1)[-1]
    else:
        raise KeycloakHatasi(f"Kullanici olusturulamadi: {yanit.text}")

    rol_ata(kullanici_id, rol)
    return kullanici_id


def rol_ata(kullanici_id: str, rol: str) -> None:
    """Verilen realm rolunu atar ve DIGER uygulama rollerini geri alir: rol
    her zaman tekildir (bir kullanici hem calisan hem vatandas olamaz)."""
    yanit = _admin_istek("GET", f"/roles/{rol}")
    if yanit.status_code != 200:
        raise KeycloakHatasi(f"'{rol}' rolu bulunamadi: {yanit.text}")
    hedef = yanit.json()

    mevcut = _admin_istek("GET", f"/users/{kullanici_id}/role-mappings/realm")
    if mevcut.status_code == 200:
        fazla = [
            r
            for r in mevcut.json()
            if r["name"] in UYGULAMA_ROLLERI and r["name"] != rol
        ]
        if fazla:
            _admin_istek(
                "DELETE", f"/users/{kullanici_id}/role-mappings/realm", json=fazla
            )

    ekle = _admin_istek(
        "POST",
        f"/users/{kullanici_id}/role-mappings/realm",
        json=[{"id": hedef["id"], "name": hedef["name"]}],
    )
    if ekle.status_code not in (204, 201):
        raise KeycloakHatasi(f"Rol atanamadi: {ekle.text}")


def kullanici_durumu(kullanici_id: str, aktif: bool) -> None:
    yanit = _admin_istek("PUT", f"/users/{kullanici_id}", json={"enabled": aktif})
    if yanit.status_code not in (204, 200):
        raise KeycloakHatasi(f"Hesap durumu degistirilemedi: {yanit.text}")


# Uygulamanin tanidigi realm rolleri (Keycloak'in kendi `default-roles-*`,
# `offline_access` gibi rolleri disinda kalanlar).
UYGULAMA_ROLLERI = {"admin", "calisan", "saha_calisani", "vatandas"}

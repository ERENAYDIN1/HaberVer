"""Giris/cikis akisi (OIDC yetkilendirme kodu + PKCE, BFF deseni).

Akis:

    GET  /api/auth/login    -> 302 Keycloak giris ekrani (state+nonce+PKCE
                               verifier kisa omurlu bir "akis cookie"sinde)
    GET  /api/auth/callback -> kod token'a cevrilir, kullanici provision edilir,
                               oturum satiri acilir, oturum cookie'si yazilir,
                               kullanici geldigi sayfaya doner
    POST /api/auth/logout   -> yerel oturum silinir, Keycloak cikis adresi doner
    GET  /api/auth/me       -> oturum sahibinin bilgisi (frontend bunu bekliyor)

Token'lar tarayiciya HIC gonderilmez; `sessions` satirinda kalir.
"""

import base64
import json
import os
import uuid

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import keycloak
from ..config import settings
from ..crud import session as oturum_crud
from ..crud import user as crud
from ..database import get_db
from ..models.session import Session as OturumSatiri
from ..models.user import User
from ..schemas.auth import OturumBilgi, UserOut
from ..security import get_context, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

AKIS_COOKIE = "greenasset_flow"
# Yetkilendirme akisi icin makul ust sinir: kullanici giris ekraninda bu kadar
# oyalanabilir, sonra bastan baslamasi gerekir.
AKIS_OMRU_SN = 10 * 60


def _guvenli_donus(yol: str | None) -> str:
    """Acik yonlendirme (open redirect) korumasi: yalnizca UYGULAMA ICI mutlak
    yollara donulur.

    `//baska.site` gibi protokol-goreli adreslerin yani sira `/\\baska.site` de
    reddedilir: tarayicilarin cogu ters bolüyü bu baglamda egik cizgi gibi
    okur, yani yalnizca `//` kontrol etmek bilinen bir atlatma yoludur (ayni
    sinif acik react-router'da CVE olarak kayitlidir). Ayrica satir sonu /
    kontrol karakterleri temizlenir - `Location` basligina kacip baslik
    enjeksiyonuna donusmesinler."""
    if not yol or not yol.startswith("/"):
        return "/"
    if yol.startswith(("//", "/\\")):
        return "/"
    if any(k in yol for k in "\r\n\t") or "\0" in yol:
        return "/"
    return yol


def _cookie_yaz(response: Response, ad: str, deger: str, omur: int) -> None:
    response.set_cookie(
        ad,
        deger,
        max_age=omur,
        httponly=True,
        # Lax: capraz siteden gelen POST isteklerinde cookie GITMEZ (CSRF'in
        # buyuk kismi burada kapanir), ama Keycloak'tan donen ust duzey GET
        # yonlendirmesinde gider - callback'in calismasi buna bagli.
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )


def _yonlendirme(hedef: str, *, no_store: bool = False) -> RedirectResponse:
    """`RedirectResponse` uretir; `no_store=True` ise tarayiciya bu yaniti
    ONBELLEKLEMEMESINI soyler. /login ve /callback GERCEK sayfa gezintileri
    (tarayici adres cubugu oraya gider), bu yuzden gezinti geri tusuyla tekrar
    ziyaret edilebilir; onbellek olmadan tarayici o an gercekten NE OLDUGUNU
    (akis cookie'si silinmis / kod zaten kullanilmis) sunucuya sorup taze bir
    cevap alir, donuk (stale) bir yaniti tekrar oynatmaz."""
    yanit = RedirectResponse(hedef, status_code=status.HTTP_302_FOUND)
    if no_store:
        yanit.headers["Cache-Control"] = "no-store"
    return yanit


def _hata_yonlendir(kod: str) -> RedirectResponse:
    """Giris/callback sirasinda KURTARILABILIR bir hata olustugunda kullanici
    ham bir JSON hata sayfasinda (backend'in dogrudan URL'sinde) kalmasin diye
    uygulamanin kendi giris ekranina doner. Callback her zaman tarayicinin
    ADRES CUBUGUNDA calisan tam sayfa bir gezinti oldugundan (fetch/XHR degil)
    burada `HTTPException` atmak, kullaniciya "Okunakli hale getir" dugmesiyle
    ciplak {"detail": ...} govdesi gosterilen bir sayfa acar - normal
    kullanicinin ne yapacagini bilemeyecegi bir cikmaz. `Giris.tsx` zaten
    `?hata=` parametresini okuyup tekrar deneme dugmesi gosteriyor.

    Gecerli bir oturumu olan kullaniciyi buradan sessizce uygulamaya geri
    ALMAYIZ; bayat bir giris adresi ziyaret edildiginde (tipik olarak GERI
    TUSU) her zaman bu ekran gosterilir. Buyuk saglayicilarin (ornegin
    Microsoft hesap girisi) davranisi da budur: giris akisinin duraklari
    "tekrar oynatilabilir" sayfalar degildir, tekrar ziyaret edilirlerse
    kullaniciya akisi bastan baslatmasi soylenir. Sessiz kurtarma, giris
    zincirini gecmiste ileri-geri gezilebilen bir yol haline getirir - bunun
    bedeli hesap degistirmis bir kullanicinin geri tusuyla eski adimlar
    arasinda dolasabilmesidir."""
    yanit = _yonlendirme(f"/giris?hata={kod}", no_store=True)
    # Basarisiz akisin cookie'si (varsa) burada da temizlenir: bir sonraki
    # "Giris Yap" denemesi baska bir cookie kalintisiyla degil temiz baslasin.
    yanit.delete_cookie(AKIS_COOKIE, path="/")
    return yanit


@router.get("/login")
def login(next: str | None = None, kayit: bool = False):
    """Kullaniciyi Keycloak'a yonlendirir. `kayit=true` ise dogrudan kayit
    ekranina gider (vatandas oz-kaydi Keycloak'in kendi formudur)."""
    state = base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")
    nonce = base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")
    verifier, challenge = keycloak.pkce_uret()

    # no_store: bu yanit her cagrildiginda YENI bir state/nonce/verifier
    # uretip AKIS_COOKIE'yi UZERINE YAZAR. Tarayici bunu onbellekten servis
    # ederse (geri tusu / bfcache) kullanicinin dondugu Keycloak URL'sindeki
    # eski `state` ile o sirada cookie'de duran YENI state karsi karsiya
    # gelebilir - callback'te "Giris dogrulamasi basarisiz" olarak cikar.
    yanit = _yonlendirme(
        keycloak.giris_url(state=state, nonce=nonce, challenge=challenge, kayit=kayit),
        no_store=True,
    )
    # Akis durumu httpOnly cookie'de tasinir: sunucuda ayri bir tablo tutmaya
    # gerek kalmaz. Icerigi gizli degildir; guvenlik donen `state`in buradaki
    # ile ESLESMESINDEN gelir.
    _cookie_yaz(
        yanit,
        AKIS_COOKIE,
        base64.urlsafe_b64encode(
            json.dumps(
                {
                    "state": state,
                    "nonce": nonce,
                    "verifier": verifier,
                    "next": _guvenli_donus(next),
                }
            ).encode()
        ).decode(),
        AKIS_OMRU_SN,
    )
    return yanit


@router.get("/callback")
def callback(
    request: Request,
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """`/callback` HER ZAMAN tarayicinin ADRES CUBUGUNDA calisan tam sayfa bir
    gezintidir (Keycloak'in kendisi buraya yonlendirir) - fetch/XHR ile
    cagrilmaz. Bu yuzden burada asla ciplak `HTTPException` atilmaz: kurtarma
    yolu olmayan (Keycloak'a hic ulasilamadi gibi) durumlar disindaki HER
    hata `_hata_yonlendir` ile `/giris?hata=...`e doner - aksi halde kullanici
    {"detail": "..."} govdesiyle bas basa kalir ("Okunakli hale getir"
    dugmesiyle acilan o sayfa). Bu uc ayrica GERI TUSUYLA tekrar ziyaret
    edilebilir (basarili girisin ardindan bile) - o zaman `code`/`state` zaten
    kullanilmis/silinmis olur; asagidaki kontroller bunu da kapsar."""
    if error:
        return _hata_yonlendir("keycloak")
    if not code or not state:
        return _hata_yonlendir("eksik")

    ham = request.cookies.get(AKIS_COOKIE)
    if not ham:
        # Akis cookie'si yok: ya dogrudan bu URL'ye gelindi ya da (tipik
        # sebep) geri tusuyla BASARILI bir girisin callback adresine geri
        # donuldu - o girisin sonunda cookie zaten silinmisti.
        return _hata_yonlendir("oturum")
    try:
        akis = json.loads(base64.urlsafe_b64decode(ham.encode()))
    except (ValueError, json.JSONDecodeError):
        return _hata_yonlendir("oturum")

    # CSRF: donen `state`, girise baslarken uretilenle ayni olmali.
    if akis.get("state") != state:
        return _hata_yonlendir("oturum")

    try:
        token = keycloak.kod_degistir(code, akis["verifier"])
    except keycloak.KeycloakHatasi:
        # Kod tek kullanimliktir; geri tusuyla ayni koda tekrar gelinmesi de
        # (state cookie'yle eslesse bile) burada Keycloak'tan hata olarak
        # doner - kullaniciya ham 502 govdesi yerine yeniden deneme sunulur.
        return _hata_yonlendir("keycloak")

    # Nonce yalnizca id_token'da bulunur; access token'da yoksa kontrol atlanir.
    if token.claims.get("nonce") not in (None, akis.get("nonce")):
        return _hata_yonlendir("oturum")

    email = token.claims.get("email")
    if not email:
        return _hata_yonlendir("eposta")

    user = crud.keycloak_eslestir(
        db,
        keycloak_id=uuid.UUID(token.claims["sub"]),
        email=email,
        full_name=token.claims.get("name"),
        role=oturum_crud.rolu_coz(keycloak.rolleri_oku(token.claims)),
    )
    if not user.is_active:
        return _hata_yonlendir("devre_disi")

    oturum = oturum_crud.olustur(db, token, user)

    yanit = _yonlendirme(_guvenli_donus(akis.get("next")), no_store=True)
    _cookie_yaz(
        yanit,
        settings.session_cookie_name,
        str(oturum.id),
        settings.session_max_hours * 3600,
    )
    yanit.delete_cookie(AKIS_COOKIE, path="/")
    return yanit


@router.post("/logout", response_model=OturumBilgi)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Yerel oturumu siler ve Keycloak'in cikis adresini doner; frontend oraya
    gider ki kimlik saglayicidaki oturum da kapansin - yoksa "cikis yaptim ama
    giris'e basinca sorusuz iceri girdim" olur."""
    ham = request.cookies.get(settings.session_cookie_name)
    id_token = None
    if ham:
        try:
            oturum_id = uuid.UUID(ham)
        except ValueError:
            oturum_id = None
        if oturum_id is not None:
            oturum = db.get(OturumSatiri, oturum_id)
            if oturum is not None:
                id_token = oturum.id_token
                oturum_crud.sil(db, oturum_id)
    response.delete_cookie(settings.session_cookie_name, path="/")
    # Cikista /giris'e DEGIL, dogrudan /api/auth/login'e donulur: kullanici
    # cikar cikmaz araya bir "Giris Yap" dugmesi girmeden Keycloak'in kendi
    # giris formuna dusar. Bu uc kendisi Keycloak'a 302 attigi icin donguye
    # girmez (login ucu her zaman yonlendirir, /giris gibi bekleyen bir sayfa
    # degil); tum roller icin gecerlidir.
    donus = f"{settings.app_base_url.rstrip('/')}/api/auth/login?next=%2F"
    return {"cikis_url": keycloak.cikis_url(id_token, donus)}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.get("/oturum")
def oturum_bilgisi(baglam: oturum_crud.OturumBaglami = Depends(get_context)):
    """Tanilama ucu: yetki kararinin hangi rollerden verildigini ve oturumun
    ne zaman bitecegini gosterir."""
    return {
        "etkin_rol": baglam.etkin_rol,
        "roller": baglam.roller,
        "token_expires_at": baglam.oturum.token_expires_at,
        "expires_at": baglam.oturum.expires_at,
    }

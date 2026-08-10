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

AKIS_COOKIE = "haberver_flow"
# Kullanicinin giris ekraninda kalabilecegi azami sure; sonra akis bastan baslar.
AKIS_OMRU_SN = 10 * 60


def _guvenli_donus(yol: str | None) -> str:
    """Acik yonlendirme korumasi: yalnizca uygulama ici mutlak yollara donulur.

    `//baska.site` yani sira `/\\baska.site` de reddedilir - tarayicilarin cogu
    ters bolüyü egik cizgi gibi okur, yalnizca `//` kontrol etmek bilinen bir
    atlatma yoludur. Satir sonu/kontrol karakterleri de elenir ki `Location`
    basligina kacip baslik enjeksiyonuna donusmesinler."""
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
        # Lax: capraz siteden gelen POST'ta cookie gitmez (CSRF korumasi), ama
        # Keycloak'tan donen ust duzey GET yonlendirmesinde gider.
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )


def _yonlendirme(hedef: str, *, no_store: bool = False) -> RedirectResponse:
    """`RedirectResponse` uretir. `no_store=True` yaniti onbelleklenmez yapar:
    /login ve /callback gercek sayfa gezintileridir ve geri tusuyla tekrar
    ziyaret edilebilirler; onbellek olmadan tarayici o anki durumu sunucuya
    sorar, bayat bir yaniti tekrar oynatmaz."""
    yanit = RedirectResponse(hedef, status_code=status.HTTP_302_FOUND)
    if no_store:
        yanit.headers["Cache-Control"] = "no-store"
    return yanit


def _hata_yonlendir(kod: str) -> RedirectResponse:
    """Kurtarilabilir bir giris hatasinda kullaniciyi uygulamanin giris
    ekranina dondurur. Callback tarayicinin adres cubugunda calisan tam sayfa
    bir gezinti oldugu icin burada `HTTPException` atmak kullaniciya ciplak bir
    JSON govdesi gosterirdi; `Giris.tsx` ise `?hata=` parametresini okuyup
    tekrar deneme dugmesi cikarir.

    Gecerli oturumu olan kullanici da buraya duser: giris akisinin duraklari
    tekrar oynatilabilir sayfalar degildir, bayat bir adrese (tipik olarak geri
    tusuyla) gelindiginde akis bastan baslatilir."""
    yanit = _yonlendirme(f"/giris?hata={kod}", no_store=True)
    # Basarisiz akisin cookie'si de temizlenir ki sonraki deneme temiz baslasin.
    yanit.delete_cookie(AKIS_COOKIE, path="/")
    return yanit


@router.get("/login")
def login(next: str | None = None, kayit: bool = False):
    """Kullaniciyi Keycloak'a yonlendirir. `kayit=true` ise dogrudan kayit
    ekranina gider (vatandas oz-kaydi Keycloak'in kendi formudur)."""
    state = base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")
    nonce = base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")
    verifier, challenge = keycloak.pkce_uret()

    # no_store: bu yanit her cagrida yeni bir state/nonce uretip cookie'yi
    # ustune yazar. Onbellekten servis edilirse Keycloak'tan donen eski state
    # ile cookie'deki yeni state karsi karsiya gelir ve dogrulama duser.
    yanit = _yonlendirme(
        keycloak.giris_url(state=state, nonce=nonce, challenge=challenge, kayit=kayit),
        no_store=True,
    )
    # Akis durumu httpOnly cookie'de tasinir, sunucuda tablo gerekmez. Icerigi
    # gizli degildir; guvenlik donen `state`in bununla eslesmesinden gelir.
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
    """Keycloak'in yonlendirdigi tam sayfa gezinti ucu; fetch ile cagrilmaz.
    Bu yuzden burada ciplak `HTTPException` atilmaz, her hata
    `/giris?hata=...`e yonlendirilir. Uc geri tusuyla tekrar ziyaret
    edilebilir; o durumda `code`/`state` zaten kullanilmis olur ve asagidaki
    kontroller bunu yakalar."""
    if error:
        return _hata_yonlendir("keycloak")
    if not code or not state:
        return _hata_yonlendir("eksik")

    ham = request.cookies.get(AKIS_COOKIE)
    if not ham:
        # Cookie yok: ya dogrudan bu adrese gelindi ya da basarili bir girisin
        # callback'ine geri tusuyla donuldu (cookie o zaman silinmisti).
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
        # Kod tek kullanimliktir; ayni koda tekrar gelinirse Keycloak hata
        # doner ve kullaniciya ham 502 yerine yeniden deneme sunulur.
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
    gider ki kimlik saglayicidaki oturum da kapansin. Yoksa kullanici cikis
    yaptiktan sonra sorusuz iceri girebilir."""
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
    # /giris yerine dogrudan /api/auth/login'e donulur: kullanici araya bir
    # dugme girmeden Keycloak'in giris formuna duser. Login ucu her zaman
    # yonlendirdigi icin dongu olusmaz.
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

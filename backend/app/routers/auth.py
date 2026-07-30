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

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
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
    yollara donulur. `//baska.site` gibi protokol-goreli adresler reddedilir."""
    if not yol or not yol.startswith("/") or yol.startswith("//"):
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


@router.get("/login")
def login(next: str | None = None, kayit: bool = False):
    """Kullaniciyi Keycloak'a yonlendirir. `kayit=true` ise dogrudan kayit
    ekranina gider (vatandas oz-kaydi Keycloak'in kendi formudur)."""
    state = base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")
    nonce = base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")
    verifier, challenge = keycloak.pkce_uret()

    yanit = RedirectResponse(
        keycloak.giris_url(state=state, nonce=nonce, challenge=challenge, kayit=kayit),
        status_code=status.HTTP_302_FOUND,
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
    if error:
        raise HTTPException(status_code=400, detail=f"Keycloak hatasi: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Eksik yetkilendirme yaniti")

    ham = request.cookies.get(AKIS_COOKIE)
    if not ham:
        raise HTTPException(
            status_code=400, detail="Giris akisi bulunamadi, tekrar deneyin"
        )
    try:
        akis = json.loads(base64.urlsafe_b64decode(ham.encode()))
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Giris akisi cozulemedi")

    # CSRF: donen `state`, girise baslarken uretilenle ayni olmali.
    if akis.get("state") != state:
        raise HTTPException(status_code=400, detail="Giris dogrulamasi basarisiz")

    try:
        token = keycloak.kod_degistir(code, akis["verifier"])
    except keycloak.KeycloakHatasi as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Nonce yalnizca id_token'da bulunur; access token'da yoksa kontrol atlanir.
    if token.claims.get("nonce") not in (None, akis.get("nonce")):
        raise HTTPException(status_code=400, detail="Giris dogrulamasi basarisiz")

    email = token.claims.get("email")
    if not email:
        raise HTTPException(
            status_code=400,
            detail="Keycloak kullanicisinda e-posta yok; hesaba e-posta ekleyin",
        )

    user = crud.keycloak_eslestir(
        db,
        keycloak_id=uuid.UUID(token.claims["sub"]),
        email=email,
        full_name=token.claims.get("name"),
        role=oturum_crud.rolu_coz(keycloak.rolleri_oku(token.claims)),
    )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Hesap devre disi")

    oturum = oturum_crud.olustur(db, token, user)

    yanit = RedirectResponse(
        _guvenli_donus(akis.get("next")), status_code=status.HTTP_302_FOUND
    )
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
    return {"cikis_url": keycloak.cikis_url(id_token, settings.app_base_url)}


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

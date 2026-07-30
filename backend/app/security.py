"""Kimlik dogrulama: Keycloak (OIDC) + sunucu tarafi oturum (BFF deseni).

Tarayici token GORMEZ; yalnizca `sessions` satirinin id'sini tasiyan httpOnly
bir cookie tutar. Bir istek geldiginde:

    cookie -> sessions satiri -> saklanan access token DOGRULANIR (JWKS,
    issuer, sure) -> roller token'dan okunur -> yetki karari verilir.

**Yetki karari her zaman token'daki rollerden verilir**, `users.role`
kolonundan degil. O kolon yalnizca SQL sorgulari icindir (ekip listeleri,
otomatik atamadaki `WHERE role='saha_calisani'` gibi, yani o an giris yapmamis
kullanicilar uzerinde calisan yerler) ve her istekte token'daki rolle
guncellenir. Bu ayrimi bozmayin: bir yetki kontrolu `user.role` okumaya
baslarsa, bayat bir kolon yetki karari verir hale gelir.

`require_role` / `personel` / `saha_dahil` bagimliliklarinin IMZALARI eski
yerel-JWT donemiyle ayni kaldi (hepsi `User` dondurur); bu yuzden router'larin
hicbiri degismedi.
"""

import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import settings
from .crud import session as oturum_crud
from .database import get_db
from .models.user import User, UserRole


def _kimlik_hatasi() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Gecersiz veya suresi dolmus oturum",
    )


def _oturum_id(request: Request) -> uuid.UUID | None:
    ham = request.cookies.get(settings.session_cookie_name)
    if not ham:
        return None
    try:
        return uuid.UUID(ham)
    except ValueError:
        return None


def get_context(
    request: Request, db: Session = Depends(get_db)
) -> oturum_crud.OturumBaglami:
    """Oturum baglami: (oturum, kullanici, token'daki roller)."""
    oturum_id = _oturum_id(request)
    if oturum_id is None:
        raise _kimlik_hatasi()
    baglam = oturum_crud.coz(db, oturum_id)
    if baglam is None or not baglam.user.is_active:
        raise _kimlik_hatasi()
    return baglam


def get_current_user(
    baglam: oturum_crud.OturumBaglami = Depends(get_context),
) -> User:
    return baglam.user


def _yetki_kontrol(
    baglam: oturum_crud.OturumBaglami, roller: tuple[UserRole, ...]
) -> User:
    # Ham rol listesinde "iceriyor mu" diye BAKILMAZ: realm'in default rol
    # bilesigi herkese `vatandas` verdigi icin oyle bir kontrol bir admin'i de
    # vatandas ucundan gecirirdi. Karar tek etkin role gore verilir.
    if baglam.etkin_rol not in roller:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu islem icin yetkiniz yok",
        )
    return baglam.user


def require_role(*roller: UserRole):
    """Belirli rollere sahip kullanicilari geciren bir bagimlilik uretir."""

    def kontrol(baglam: oturum_crud.OturumBaglami = Depends(get_context)) -> User:
        return _yetki_kontrol(baglam, roller)

    return kontrol


# Sik kullanilan rol kombinasyonlari icin kisayollar.
def personel(baglam: oturum_crud.OturumBaglami = Depends(get_context)) -> User:
    """Admin veya calisan (tam varlik yonetimi + ihbar onayi yapabilenler)."""
    return _yetki_kontrol(baglam, (UserRole.admin, UserRole.calisan))


def saha_dahil(baglam: oturum_crud.OturumBaglami = Depends(get_context)) -> User:
    """Admin, calisan veya saha calisani (varlik goruntuleme + tamir isaretleme).
    Saha calisani tam CRUD yapamaz, sadece atanan/gordugu varligi tamir edildi
    olarak isaretleyebilir (bkz. assets router'indaki /onar ucu)."""
    return _yetki_kontrol(
        baglam, (UserRole.admin, UserRole.calisan, UserRole.saha_calisani)
    )

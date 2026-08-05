"""Kimlik dogrulama: Keycloak (OIDC) + sunucu tarafi oturum (BFF deseni).

Tarayici token GORMEZ; yalnizca `sessions` satirinin id'sini tasiyan httpOnly
bir cookie tutar. Bir istek geldiginde:

    cookie -> sessions satiri -> saklanan access token DOGRULANIR (JWKS,
    issuer, sure) -> roller token'dan okunur -> yetki karari verilir.

Yetki karari her zaman token'daki rollerden verilir, `users.role` kolonundan
degil. O kolon yalnizca SQL sorgulari icindir (giris yapmamis kullanicilar
uzerinde calisan ekip listeleri, otomatik atama) ve her istekte token'daki
rolle guncellenir. Bu ayrim bozulursa bayat bir kolon yetki verir hale gelir.
"""

import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import settings
from .crud import departman as departman_crud
from .crud import session as oturum_crud
from .database import get_db
from .models.asset import AssetType
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
    # Ham rol listesine bakilmaz (herkeste `vatandas` var); karar tek etkin
    # role gore verilir - bkz. crud/session.rolu_coz.
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
    """Admin veya calisan (tam varlik yonetimi + talep onayi yapabilenler)."""
    return _yetki_kontrol(baglam, (UserRole.admin, UserRole.calisan))


def saha_dahil(baglam: oturum_crud.OturumBaglami = Depends(get_context)) -> User:
    """Admin, calisan veya saha calisani. Saha calisani tam CRUD yapamaz,
    yalnizca kendisine atanan varligi tamir edildi isaretleyebilir (/onar)."""
    return _yetki_kontrol(
        baglam, (UserRole.admin, UserRole.calisan, UserRole.saha_calisani)
    )


# --- Departman kapsami ------------------------------------------------------
#
# Bir belediyede agac isi Park ve Bahceler'e, yol catlagi Fen Isleri'ne gider ve
# bir mudurluk digerinin isine bakmaz. Kural ROL degil DEPARTMAN duzeyindedir:
# `calisan` rolu hala "varlik yonetebilir" demektir, ama HANGI varliklari
# yonetebilecegini `users.departman` -> `tur_departman` zinciri belirler.
#
# Kural backend'de durur, arayuzde degil: yeni bir ekran eklendiginde sessizce
# kaybolmasin (bkz. CLAUDE.md "Guvenlik Kurallari" - /onar sahiplik kontrolu
# ayni gerekceyle burada).


@dataclass(frozen=True)
class Kapsam:
    """Kullanicinin gorebilecegi/yonetebilecegi tur kumesi.

    `turler is None` SINIRSIZ demektir (admin) - bos kumeyle ayni sey degildir;
    departmani olmayan bir personel BOS kume alir ve hicbir sey goremez."""

    turler: set[AssetType] | None
    departman: str | None

    @property
    def sinirsiz(self) -> bool:
        return self.turler is None

    def izinli(self, tur: AssetType) -> bool:
        return self.turler is None or tur in self.turler

    def dogrula(self, tur: AssetType) -> None:
        """Kapsam disi bir tur icin 403. Yazma uclarinin (onay/ret/CRUD) tek
        kapisi budur."""
        if not self.izinli(tur):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu tur sizin departmaninizin kapsaminda degil",
            )


def kapsam(
    baglam: oturum_crud.OturumBaglami = Depends(get_context),
    db: Session = Depends(get_db),
) -> Kapsam:
    """Istek basina TEK sorguda cozulen departman kapsami. Okuma uclari bunu
    bir WHERE kosuluna, yazma uclari `dogrula()` cagrisina cevirir."""
    return Kapsam(
        turler=departman_crud.kullanici_kapsami(db, baglam.user, baglam.etkin_rol),
        departman=baglam.user.departman,
    )

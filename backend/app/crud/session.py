"""BFF oturumlari: cookie'deki id -> Keycloak token'lari + yerel kullanici.

Oturumun tazeligi iki katmanlidir:
  * access token suresi dolunca refresh ile yenilenir; ayni anda roller
    Keycloak'tan tazelenir (yetki degisikliginin yansima suresi = token omru).
  * refresh basarisiz olursa oturum Keycloak tarafinda kapatilmistir (cikis,
    admin iptali, hesap kapatma) - satir silinir, kullanici 401 alir.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.orm import Session as DbSession

from .. import keycloak
from ..config import settings
from ..models.session import Session
from ..models.user import User, UserRole


def rolu_coz(roller: list[str]) -> UserRole:
    """Keycloak realm rollerinden ETKIN uygulama rolu (tek rol).

    Bu bir "hangi roller var" degil "hangi rol gecerli" sorusudur ve YETKI
    KARARININ dayanagidir. Coklu rol normalde olusmaz (keycloak.rol_ata tekil
    tutar) ama realm'in `default-roles-*` bilesigi HERKESE `vatandas` verir;
    bu yuzden en genis rol kazanir - yoksa bir admin, vatandas ucuna da
    girebilirdi. Hicbir uygulama rolu yoksa vatandas: Keycloak'ta kendi
    kaydolan kullanicinin durumu budur."""
    for aday in (UserRole.admin, UserRole.calisan, UserRole.saha_calisani):
        if aday.value in roller:
            return aday
    return UserRole.vatandas


def olustur(db: DbSession, token: keycloak.TokenSeti, user: User) -> Session:
    simdi = datetime.now(timezone.utc)
    oturum = Session(
        user_id=user.id,
        access_token=token.access_token,
        refresh_token=token.refresh_token,
        id_token=token.id_token,
        keycloak_sid=token.claims.get("sid"),
        token_expires_at=simdi + timedelta(seconds=token.expires_in),
        expires_at=simdi + timedelta(hours=settings.session_max_hours),
    )
    db.add(oturum)
    db.commit()
    db.refresh(oturum)
    return oturum


def sil(db: DbSession, oturum_id: uuid.UUID) -> None:
    db.execute(delete(Session).where(Session.id == oturum_id))
    db.commit()


def kullanicinin_oturumlarini_sil(db: DbSession, user_id: uuid.UUID) -> None:
    """Hesap kapatildiginda/rolu degistiginde acik oturumlari dusurur."""
    db.execute(delete(Session).where(Session.user_id == user_id))
    db.commit()


@dataclass
class OturumBaglami:
    oturum: Session
    user: User
    #: Access token'in icindeki ham realm rolleri (Keycloak'in kendi
    #: `default-roles-*`, `offline_access` gibi rolleri dahil).
    roller: list[str]
    #: Bu istekteki YETKI KAYNAGI: ham rollerden cozulen tek etkin rol.
    #: `user.role` kolonu bunun yalnizca SQL sorgulari icin tutulan aynasidir.
    etkin_rol: UserRole


def coz(db: DbSession, oturum_id: uuid.UUID) -> OturumBaglami | None:
    """Cookie'deki id'den oturum baglami. Gecersiz/suresi dolmus oturumda None
    doner ve satir temizlenir."""
    oturum = db.get(Session, oturum_id)
    if oturum is None:
        return None

    simdi = datetime.now(timezone.utc)
    if oturum.expires_at <= simdi:
        sil(db, oturum.id)
        return None

    user = db.get(User, oturum.user_id)
    if user is None:
        sil(db, oturum.id)
        return None

    # Access token'in suresi doldu (ya da dolmak uzere): yenile. Yenileme
    # kalirsa oturum Keycloak tarafinda iptal edilmis demektir.
    if oturum.token_expires_at <= simdi + timedelta(seconds=30):
        if not oturum.refresh_token:
            sil(db, oturum.id)
            return None
        try:
            yeni = keycloak.token_yenile(oturum.refresh_token)
        except keycloak.KeycloakHatasi:
            sil(db, oturum.id)
            return None
        oturum.access_token = yeni.access_token
        oturum.refresh_token = yeni.refresh_token or oturum.refresh_token
        if yeni.id_token:
            oturum.id_token = yeni.id_token
        oturum.token_expires_at = simdi + timedelta(seconds=yeni.expires_in)
        claims = yeni.claims
    else:
        # Saklanan token'i her istekte yeniden dogrularim (imza + issuer +
        # sure): yetki karari her zaman token'dan okunur, veritabanindaki
        # satirdan degil.
        try:
            claims = keycloak.token_dogrula(oturum.access_token)
        except keycloak.KeycloakHatasi:
            sil(db, oturum.id)
            return None

    roller = keycloak.rolleri_oku(claims)
    # Rol aynasi: SQL sorgulari (ekip listeleri, otomatik atama) kolonu okur,
    # bu yuzden token'daki rolle farkliysa guncellenir.
    yeni_rol = rolu_coz(roller)
    if user.role != yeni_rol:
        user.role = yeni_rol

    oturum.last_used_at = simdi
    db.commit()
    return OturumBaglami(oturum=oturum, user=user, roller=roller, etkin_rol=yeni_rol)


def temizle(db: DbSession) -> int:
    """Suresi gecmis oturumlari toplu siler (bakim islemi)."""
    sonuc = db.execute(
        delete(Session).where(Session.expires_at <= datetime.now(timezone.utc))
    )
    db.commit()
    return sonuc.rowcount or 0



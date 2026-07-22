"""Kimlik dogrulama altyapisi: parola hash'leme, JWT uretme/dogrulama ve
rol tabanli erisim kontrolu icin FastAPI bagimliliklari.

Not: Bu, sistem uzerinde gecici bir cozumdur. Ileride kullanici girisleri
Keycloak'a tasinacak; o zaman token dogrulama Keycloak'in JWKS'ine gore yapilacak.
"""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models.user import User, UserRole

# tokenUrl sadece OpenAPI dokumantasyonu icin; gercek uc /api/auth/login.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def hash_password(parola: str) -> str:
    return bcrypt.hashpw(parola.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(parola: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(parola.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user: User) -> str:
    simdi = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "email": user.email,
        "iat": simdi,
        "exp": simdi + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    kimlik_hatasi = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Gecersiz veya suresi dolmus oturum",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise kimlik_hatasi
    except jwt.PyJWTError:
        raise kimlik_hatasi

    user = db.get(User, uuid.UUID(user_id))
    if user is None or not user.is_active:
        raise kimlik_hatasi
    return user


def require_role(*roller: UserRole):
    """Belirli rollere sahip kullanicilari geciren bir bagimlilik uretir."""

    def kontrol(user: User = Depends(get_current_user)) -> User:
        if user.role not in roller:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu islem icin yetkiniz yok",
            )
        return user

    return kontrol


# Sik kullanilan rol kombinasyonlari icin kisayollar.
def personel(user: User = Depends(get_current_user)) -> User:
    """Admin veya calisan (varlik yonetimi + ihbar onayi yapabilenler)."""
    if user.role not in (UserRole.admin, UserRole.calisan):
        raise HTTPException(status_code=403, detail="Bu islem icin yetkiniz yok")
    return user

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from ..models.user import UserRole
from ..models.yaka import Yaka


class UserCreate(BaseModel):
    """Admin tarafindan personel/admin hesabi olusturma. Hesap once Keycloak'ta
    acilir (parola oraya yazilir), sonra yerel satir baglanir.

    Not: Parola ve giris ile ilgili sema kalmadi - giris Keycloak'in kendi
    ekraninda yapilir, vatandas kaydi da orada (bkz. routers/auth.py)."""

    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    role: UserRole = UserRole.calisan
    # Yalnizca saha_calisani icin anlamli: ekibin kadro yakasi. Bos birakilirsa
    # ekibin yakasi son bildirdigi konumdan turetilir.
    yaka: Yaka | None = None


class UserUpdate(BaseModel):
    """Admin tarafindan mevcut bir hesabin guncellenmesi (su an yalnizca yaka)."""

    yaka: Yaka | None = None


class OturumBilgi(BaseModel):
    """Cikis yaniti: frontend bu adrese giderek Keycloak oturumunu da kapatir."""

    cikis_url: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    role: UserRole
    is_active: bool
    created_at: datetime
    yaka: Yaka | None = None



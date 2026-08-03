import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import keycloak
from ..crud import user as crud
from ..database import get_db
from ..models.user import User, UserRole
from ..schemas.auth import UserCreate, UserOut, UserUpdate
from ..security import require_role

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    _: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    return [UserOut.model_validate(u) for u in crud.list_users(db)]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    """Admin, personel (calisan) veya baska bir admin hesabi olusturur.

    Hesap once Keycloak'ta acilir, sonra yerel satir baglanir (bkz.
    crud/user.py::create_user). Keycloak'ta ayni e-postali bir kullanici varsa
    o kullanici kullanilir ve rolu guncellenir - Keycloak'tan kendi kaydolmus
    bir vatandasi personele terfi ettirmenin yolu budur."""
    if crud.get_by_email(db, data.email.lower()) is not None:
        raise HTTPException(status_code=409, detail="Bu e-posta zaten kayitli")
    try:
        user = crud.create_user(
            db,
            email=data.email,
            password=data.password,
            role=data.role,
            full_name=data.full_name,
            actor=admin_user,
            yaka=data.yaka.value if data.yaka else None,
        )
    except keycloak.KeycloakHatasi as e:
        # Yerel satir acilmadi: Keycloak'a yazamadigimizda giris yapamayacak
        # bir "hayalet hesap" birakmayiz.
        raise HTTPException(status_code=502, detail=f"Keycloak: {e}")
    return UserOut.model_validate(user)





@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    """Admin bir hesabi gunceller: kadro yakasi ve/veya aktiflik.

    Hangi alanin GONDERILDIGI `exclude_unset` ile ayirt edilir; alani hic
    gondermemek "dokunma" demektir (bkz. schemas/auth.py::UserUpdate)."""
    user = crud.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Kullanici bulunamadi")

    gonderilen = data.model_dump(exclude_unset=True)

    if "is_active" in gonderilen:
        aktif = bool(gonderilen["is_active"])
        # Admin kendi hesabini kapatamaz: kendini disari kilitlemenin en kolay
        # yolu bu olurdu ve geri almak icin veritabanina elle girmek gerekirdi.
        if user.id == admin_user.id and not aktif:
            raise HTTPException(
                status_code=409, detail="Kendi hesabinizi devre disi birakamazsiniz"
            )
        # Son aktif admin'i dusurmek sistemi yonetilemez birakir - hicbir admin
        # kalmadiginda hesap acacak/geri acacak kimse olmaz.
        if not aktif and user.role is UserRole.admin and crud.aktif_admin_sayisi(db) <= 1:
            raise HTTPException(
                status_code=409, detail="Sistemde en az bir aktif yonetici kalmali"
            )
        try:
            user = crud.set_active(db, user, aktif, actor=admin_user)
        except keycloak.KeycloakHatasi as e:
            # Keycloak'a yazamadik: yerel satira DOKUNMADIK, yoksa "kapattim
            # sandim ama giris yapabiliyor" durumu olusurdu.
            raise HTTPException(status_code=502, detail=f"Keycloak: {e}")

    if "yaka" in gonderilen:
        if user.role != UserRole.saha_calisani:
            raise HTTPException(
                status_code=409, detail="Yaka yalnizca saha ekipleri icin tanimlanir"
            )
        user = crud.set_yaka(
            db, user, data.yaka.value if data.yaka else None, actor=admin_user
        )

    return UserOut.model_validate(user)

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import keycloak
from ..crud import departman as departman_crud
from ..crud import user as crud
from ..database import get_db
from ..models.user import User, UserRole
from ..schemas.auth import UserCreate, UserOut, UserUpdate
from ..security import require_role

router = APIRouter(prefix="/api/users", tags=["users"])


def _departman_dogrula(db: Session, role: UserRole, departman: str | None) -> None:
    """Departman `calisan`/`saha_calisani` icin zorunlu, admin/vatandas icin
    anlamsizdir.

    Zorunlulugun sebebi sessiz bir bosluk: departmani olmayan bir personelin
    kapsami BOS kumedir, yani hesap acilir ama kullanici hicbir sey goremez ve
    nedenini anlamaz. Hatayi hesap acilirken vermek dogru yer."""
    if role in crud.DEPARTMANLI_ROLLER:
        if not departman:
            raise HTTPException(
                status_code=422,
                detail="Personel ve saha ekipleri icin departman zorunludur",
            )
        if departman_crud.get(db, departman) is None:
            raise HTTPException(status_code=422, detail="Bilinmeyen departman")
    elif departman:
        raise HTTPException(
            status_code=422,
            detail="Bu rol icin departman tanimlanmaz (admin tum departmanlari gorur)",
        )


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
    _departman_dogrula(db, data.role, data.departman)
    try:
        user = crud.create_user(
            db,
            email=data.email,
            password=data.password,
            role=data.role,
            full_name=data.full_name,
            actor=admin_user,
            yaka=data.yaka.value if data.yaka else None,
            departman=data.departman,
        )
    except keycloak.KeycloakHatasi as e:
        # Yerel satir acilmadi: giris yapamayacak bir hayalet hesap kalmasin.
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
        # Admin kendi hesabini kapatamaz: geri almak icin veritabanina elle
        # girmek gerekirdi.
        if user.id == admin_user.id and not aktif:
            raise HTTPException(
                status_code=409, detail="Kendi hesabinizi devre disi birakamazsiniz"
            )
        # Son aktif admin dusurulurse hesap acacak/geri acacak kimse kalmaz.
        if not aktif and user.role is UserRole.admin and crud.aktif_admin_sayisi(db) <= 1:
            raise HTTPException(
                status_code=409, detail="Sistemde en az bir aktif yonetici kalmali"
            )
        try:
            user = crud.set_active(db, user, aktif, actor=admin_user)
        except keycloak.KeycloakHatasi as e:
            # Keycloak'a yazilamadi: yerel satira dokunulmadi, yoksa "kapattim
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

    if "departman" in gonderilen:
        # Yakadan farkli olarak NULL kabul edilmez: departmansiz bir personel
        # hicbir sey goremez, "temizlemek" hesabi sessizce ise yaramaz kilardi.
        _departman_dogrula(db, user.role, data.departman)
        if data.departman and data.departman != user.departman:
            user = crud.set_departman(db, user, data.departman, actor=admin_user)

    return UserOut.model_validate(user)

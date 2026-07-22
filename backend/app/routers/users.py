from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..crud import user as crud
from ..database import get_db
from ..models.user import User, UserRole
from ..schemas.auth import UserCreate, UserOut
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
    _: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    """Admin, personel (calisan) veya baska bir admin hesabi olusturur."""
    if crud.get_by_email(db, data.email.lower()) is not None:
        raise HTTPException(status_code=409, detail="Bu e-posta zaten kayitli")
    user = crud.create_user(
        db,
        email=data.email,
        password=data.password,
        role=data.role,
        full_name=data.full_name,
    )
    return UserOut.model_validate(user)

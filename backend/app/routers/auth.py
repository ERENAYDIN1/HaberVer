from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..crud import user as crud
from ..database import get_db
from ..models.user import User, UserRole
from ..schemas.auth import CitizenRegister, LoginRequest, Token, UserOut
from ..security import create_access_token, get_current_user, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = crud.get_by_email(db, data.email.lower())
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya parola hatali",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Hesap devre disi")
    return Token(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(data: CitizenRegister, db: Session = Depends(get_db)):
    """Vatandas oz-kaydi. Rol her zaman 'vatandas' olur; personel hesaplarini
    yalnizca admin (/api/users) olusturabilir."""
    if crud.get_by_email(db, data.email.lower()) is not None:
        raise HTTPException(status_code=409, detail="Bu e-posta zaten kayitli")
    user = crud.create_user(
        db,
        email=data.email,
        password=data.password,
        role=UserRole.vatandas,
        full_name=data.full_name,
    )
    return Token(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)

"""Departman sozlugu ve tur -> departman yonlendirmesi.

Liste ucu GIRIS YAPMIS HERKESE aciktir - vatandas talep formunda "bu talep Fen
Isleri Mudurlugu'ne iletilecek" yazabilsin diye. Burada gizli bir sey yok:
hangi mudurlugun neye baktigi bir belediyenin zaten ilan ettigi bilgidir.
Yonlendirmeyi DEGISTIRMEK ise yalnizca admin'in isidir."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..crud import departman as crud
from ..database import get_db
from ..models.user import User, UserRole
from ..schemas.departman import DepartmanOut, EslemeOut, EslemeUpdate
from ..security import get_current_user, require_role

router = APIRouter(prefix="/api/departmanlar", tags=["departmanlar"])


@router.get("", response_model=list[DepartmanOut])
def list_departmanlar(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [DepartmanOut.model_validate(d) for d in crud.list_departmanlar(db)]


@router.get("/esleme", response_model=EslemeOut)
def get_esleme(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return EslemeOut(esleme=crud.esleme(db))


@router.put("/esleme", response_model=EslemeOut)
def update_esleme(
    data: EslemeUpdate,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    """Tur -> departman yonlendirmesini gunceller (kismi).

    Yonlendirmenin degismesi GECMISE DOKUNMAZ: mevcut talepler ve varliklar
    turleriyle birlikte yeni departmanin kapsamina gecer (kapsam her istekte
    canli hesaplanir), ama daha once yazilmis audit log kayitlari eski
    departmanlarinda kalir - log bir olayin O ANDAKI halidir."""
    kodlar = {d.kod for d in crud.list_departmanlar(db)}
    bilinmeyen = set(data.esleme.values()) - kodlar
    if bilinmeyen:
        raise HTTPException(
            status_code=422, detail=f"Bilinmeyen departman: {', '.join(sorted(bilinmeyen))}"
        )
    return EslemeOut(esleme=crud.esleme_guncelle(db, data.esleme, actor=admin_user))

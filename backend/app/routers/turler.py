"""Tur sozlugu: varlik/talep turlerinin kendisi (bkz. models/tur.py).

Okuma ucu GIRIS YAPMIS HERKESE aciktir - vatandas talep formu tur listesini
buradan cizer. Sozlugu DEGISTIRMEK yalnizca admin'in isidir: bir tur kodu
kayitlarin icinde yasar, `calisan` rolunun kendi mudurlugu disinda kalan bir
sozlugu yeniden duzenlemesi icin sebep yok.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..crud import departman as departman_crud
from ..crud import tur as crud
from ..database import get_db
from ..models.tur import TUR_GRUPLARI
from ..models.user import User, UserRole
from ..schemas.tur import TurCreate, TurOut, TurUpdate
from ..security import get_current_user, require_role

router = APIRouter(prefix="/api/turler", tags=["turler"])


def _grup_dogrula(grup: str | None) -> None:
    if grup is not None and grup not in TUR_GRUPLARI:
        raise HTTPException(
            status_code=422,
            detail=f"Gecersiz grup: {grup}. Secenekler: {', '.join(TUR_GRUPLARI)}",
        )


@router.get("", response_model=list[TurOut])
def list_turler(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tum turler. Sozluk tektir: bu listedeki her tur hem lejantta, hem
    vatandasin talep formunda, hem personelin envanter formunda gecerlidir."""
    return [TurOut.model_validate(t) for t in crud.list_turler(db)]


@router.post("", response_model=TurOut, status_code=status.HTTP_201_CREATED)
def create_tur(
    data: TurCreate,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    """Yeni tur ekler ve mudurlugune baglar.

    Kod sonradan degistirilemez: `assets.type` / `talepler.type` icinde yasayan
    deger odur. Bu yuzden cakisma 409 ile acikca reddedilir - "zaten var" olan
    bir kodu sessizce guncellemek baska bir turun anlamini degistirirdi."""
    _grup_dogrula(data.grup)
    if crud.get(db, data.kod) is not None:
        raise HTTPException(status_code=409, detail="Bu kod zaten kullaniliyor")
    if departman_crud.get(db, data.departman) is None:
        raise HTTPException(
            status_code=422, detail=f"Bilinmeyen departman: {data.departman}"
        )
    return TurOut.model_validate(crud.create(db, data, actor=admin_user))


@router.patch("/{kod}", response_model=TurOut)
def update_tur(
    kod: str,
    data: TurUpdate,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    _grup_dogrula(data.grup)
    tur = crud.update(db, kod, data, actor=admin_user)
    if tur is None:
        raise HTTPException(status_code=404, detail="Tur bulunamadi")
    return TurOut.model_validate(tur)


@router.delete("/{kod}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tur(
    kod: str,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    """Turu siler. KULLANIMDA ise silinmez (409): tur kodu kayitlarin icinde
    yasadigi icin silmek gecmisi okunamaz hale getirirdi. Yanit neyin
    engelledigini sayiyla soyler."""
    if crud.get(db, kod) is None:
        raise HTTPException(status_code=404, detail="Tur bulunamadi")
    sayilar = crud.kullanim(db, kod)
    if sayilar["varlik"] or sayilar["talep"]:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Bu tür kullanımda: {sayilar['varlik']} varlık, "
                f"{sayilar['talep']} talep. Once bu kayitlarin turu degismeli."
            ),
        )
    crud.delete(db, kod, actor=admin_user)

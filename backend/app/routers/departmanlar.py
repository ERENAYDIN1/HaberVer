"""Departman sozlugu ve tur -> departman yonlendirmesi.

Liste ucu GIRIS YAPMIS HERKESE aciktir - vatandas talep formunda "bu talep Fen
Isleri Mudurlugu'ne iletilecek" yazabilsin diye. Burada gizli bir sey yok:
hangi mudurlugun neye baktigi bir belediyenin zaten ilan ettigi bilgidir.
Yonlendirmeyi DEGISTIRMEK ise yalnizca admin'in isidir."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..crud import departman as crud
from ..crud import tur as tur_crud
from ..database import get_db
from ..models.user import User, UserRole
from ..schemas.departman import (
    DepartmanCreate,
    DepartmanOut,
    DepartmanUpdate,
    EslemeOut,
    EslemeUpdate,
)
from ..security import get_current_user, require_role

router = APIRouter(prefix="/api/departmanlar", tags=["departmanlar"])


@router.get("", response_model=list[DepartmanOut])
def list_departmanlar(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [DepartmanOut.model_validate(d) for d in crud.list_departmanlar(db)]


@router.post("", response_model=DepartmanOut, status_code=201)
def create_departman(
    data: DepartmanCreate,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    """Yeni mudurluk. Kod sonradan degistirilemez - personel, tur, bolge ve
    audit log satirlari ona baglanir; cakisma bu yuzden 409 ile reddedilir."""
    if crud.get(db, data.kod) is not None:
        raise HTTPException(status_code=409, detail="Bu kod zaten kullaniliyor")
    return DepartmanOut.model_validate(crud.create(db, data, actor=admin_user))


@router.patch("/{kod}", response_model=DepartmanOut)
def update_departman(
    kod: str,
    data: DepartmanUpdate,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    departman = crud.update(db, kod, data, actor=admin_user)
    if departman is None:
        raise HTTPException(status_code=404, detail="Departman bulunamadi")
    return DepartmanOut.model_validate(departman)


@router.delete("/{kod}", status_code=204)
def delete_departman(
    kod: str,
    admin_user: User = Depends(require_role(UserRole.admin)),
    db: Session = Depends(get_db),
):
    """Mudurlugu siler. Herhangi bir bagi varsa (personel, tur, kaydedilmis
    bolge ya da audit log) 409 doner: gecmisi olan bir mudurlugun kapanmasi o
    gecmisi yok etmemeli. Kapanan mudurluk `aktif=false` ile emekliye ayrilir -
    yeni personel/tur ona baglanamaz, kayitlari yerinde kalir."""
    if crud.get(db, kod) is None:
        raise HTTPException(status_code=404, detail="Departman bulunamadi")
    sayilar = crud.kullanim(db, kod)
    if any(sayilar.values()):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Bu müdürlük kullanımda: {sayilar['personel']} personel, "
                f"{sayilar['tur']} tür, {sayilar['bolge']} bölge/güzergâh, "
                f"{sayilar['kayit']} geçmiş kaydı. "
                "Silmek yerine pasife alabilirsiniz."
            ),
        )
    crud.delete(db, kod, actor=admin_user)


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
    # Tur artik bir enum degil bir tablo satiri (bkz. models/tur.py): pydantic
    # gecerliligi dogrulayamaz, sozluge bakmak gerekir.
    bilinmeyen_tur = {t for t in data.esleme if tur_crud.get(db, t) is None}
    if bilinmeyen_tur:
        raise HTTPException(
            status_code=422,
            detail=f"Bilinmeyen tur: {', '.join(sorted(bilinmeyen_tur))}",
        )
    return EslemeOut(esleme=crud.esleme_guncelle(db, data.esleme, actor=admin_user))

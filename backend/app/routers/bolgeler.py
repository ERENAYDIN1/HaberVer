import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..crud import bolge as crud
from ..database import get_db
from ..models.bolge import BolgeTipi
from ..models.user import User, UserRole
from ..schemas.bolge import (
    BolgeAtama,
    BolgeCikti,
    BolgeGirdi,
    BolgeGuncelle,
    BolgeTamamlama,
)
from ..security import personel, require_role, saha_dahil

router = APIRouter(prefix="/api/bolgeler", tags=["bolgeler"])


@router.get("/benim", response_model=list[BolgeCikti])
def bolgelerim(
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Saha ekibine atanmis gorev bolgeleri ve guzergahlar (tamamlananlar
    dahil - ekip kendi ekraninda ayirir ve geri alabilir)."""
    return crud.list_bolgelerim(db, user.id)


@router.get("", response_model=list[BolgeCikti], dependencies=[Depends(personel)])
def bolgeler(db: Session = Depends(get_db)):
    """Personel: kaydedilmis tum gorev bolgeleri ve guzergahlar."""
    return crud.list_bolgeler(db)


@router.post("", response_model=BolgeCikti, status_code=status.HTTP_201_CREATED)
def bolge_olustur(
    data: BolgeGirdi,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    return crud.create_bolge(db, data, actor=user)


@router.patch("/{bolge_id}", response_model=BolgeCikti)
def bolge_guncelle(
    bolge_id: uuid.UUID,
    data: BolgeGuncelle,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Ad/aciklama/renk ozellestirmesi ve sekil (geometri) guncellemesi.

    Sekil gonderildiyse kaydin KENDI tipine gore dogrulanir - bir alan alan,
    bir guzergah cizgi olarak kalir (tip bu uctan degistirilemez)."""
    mevcut = crud.get_bolge(db, bolge_id)
    if mevcut is None:
        raise HTTPException(status_code=404, detail="Bolge bulunamadi")

    if data.noktalar is not None:
        if mevcut.tip is BolgeTipi.cizgi:
            if len(data.noktalar) != 1 or len(data.noktalar[0]) < 2:
                raise HTTPException(
                    status_code=422,
                    detail="Güzergâh tek bir dizide en az 2 nokta içermelidir",
                )
        elif any(len(halka) < 3 for halka in data.noktalar):
            raise HTTPException(
                status_code=422,
                detail="Her alan halkası en az 3 nokta içermelidir",
            )

    sonuc = crud.update_bolge(db, bolge_id, data, actor=user)
    if sonuc is None:
        raise HTTPException(status_code=404, detail="Bolge bulunamadi")
    return sonuc


@router.delete("/{bolge_id}", status_code=status.HTTP_204_NO_CONTENT)
def bolge_sil(
    bolge_id: uuid.UUID,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    if not crud.delete_bolge(db, bolge_id, actor=user):
        raise HTTPException(status_code=404, detail="Bolge bulunamadi")


@router.post("/{bolge_id}/ata", response_model=BolgeCikti)
def bolge_ata(
    bolge_id: uuid.UUID,
    data: BolgeAtama,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Kaydi bir saha ekibine atar; worker_id=null atamayi kaldirir.

    Alan bir 'gorev bolgesi', cizgi bir 'guzergah' olarak atanir - ikisi de
    ekibin kendi ekraninda gorunur."""
    mevcut = crud.get_bolge(db, bolge_id)
    if mevcut is None:
        raise HTTPException(status_code=404, detail="Bolge bulunamadi")

    worker: User | None = None
    if data.worker_id is not None:
        worker = db.get(User, data.worker_id)
        if worker is None or worker.role != UserRole.saha_calisani:
            raise HTTPException(status_code=404, detail="Saha ekibi bulunamadi")

    return crud.ata(db, bolge_id, worker, actor=user)


@router.post("/{bolge_id}/tamamla", response_model=BolgeCikti)
def bolge_tamamla(
    bolge_id: uuid.UUID,
    data: BolgeTamamlama,
    user: User = Depends(saha_dahil),
    db: Session = Depends(get_db),
):
    """Bolgeyi/guzergahi tamamlandi isaretler; tamamlandi=false geri alir.

    Saha ekibi yalnizca KENDISINE atanan kaydi kapatabilir; personel (admin/
    calisan) her kaydi kapatip acabilir."""
    mevcut = crud.get_bolge(db, bolge_id)
    if mevcut is None:
        raise HTTPException(status_code=404, detail="Bolge bulunamadi")
    if user.role is UserRole.saha_calisani and mevcut.worker_id != user.id:
        raise HTTPException(status_code=403, detail="Bu bolge size atanmamis")

    return crud.tamamla(db, bolge_id, data.tamamlandi, actor=user)

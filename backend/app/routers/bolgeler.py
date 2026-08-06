"""Kaydedilmis gorev bolgeleri ve guzergahlar.

Kapsam kurali burada TURDEN degil kaydin kendi `departman` sutunundan gelir:
bir bolgenin turu yoktur (bkz. models/bolge.py). Kural yine de ayni yerde
durur - arayuz bir yetki siniri degildir; bir mudurlugun cizdigi calisma alani
digerinin ekranina API'ye dogrudan gidilerek de dusmemeli.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..crud import bolge as crud
from ..crud import departman as departman_crud
from ..crud.session import OturumBaglami
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
from ..security import Kapsam, get_context, kapsam, personel, require_role, saha_dahil

router = APIRouter(prefix="/api/bolgeler", tags=["bolgeler"])


def _kapsamda(mevcut: BolgeCikti, alan: Kapsam) -> bool:
    """Kayit bu kullanicinin mudurlugune ya da genel havuza mi ait."""
    return (
        alan.sinirsiz
        or mevcut.departman is None
        or mevcut.departman == alan.departman
    )


def _getir(db: Session, bolge_id: uuid.UUID, alan: Kapsam) -> BolgeCikti:
    """Bolgeyi kapsam kontroluyle getirir.

    Kapsam disi kayit icin 404 - 403 degil: varlik/talep uclariyla ayni tavir,
    kaydin VARLIGI da baska mudurlugun bilgisidir."""
    mevcut = crud.get_bolge(db, bolge_id)
    if mevcut is None or not _kapsamda(mevcut, alan):
        raise HTTPException(status_code=404, detail="Bolge bulunamadi")
    return mevcut


@router.get("/benim", response_model=list[BolgeCikti])
def bolgelerim(
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Saha ekibine atanmis gorev bolgeleri ve guzergahlar (tamamlananlar
    dahil - ekip kendi ekraninda ayirir ve geri alabilir).

    Departman suzgeci GEREKMEZ: ekip zaten yalnizca kendisine ATANAN kaydi
    gorur ve atama kurali kaydin mudurluguyle uyumu garanti eder."""
    return crud.list_bolgelerim(db, user.id)


@router.get("", response_model=list[BolgeCikti], dependencies=[Depends(personel)])
def bolgeler(alan: Kapsam = Depends(kapsam), db: Session = Depends(get_db)):
    """Personel: kaydedilmis gorev bolgeleri ve guzergahlar. Admin tumunu,
    diger personel yalnizca KENDI MUDURLUGUNUN ve genel kayitlari gorur."""
    return crud.list_bolgeler(db, departman=alan.departman, sinirli=not alan.sinirsiz)


@router.post("", response_model=BolgeCikti, status_code=status.HTTP_201_CREATED)
def bolge_olustur(
    data: BolgeGirdi,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Yeni bolge/guzergah.

    Mudurluk istemciden gelen degere BIRAKILMAZ: departmani olan personelin
    kaydi her zaman kendi mudurlugune yazilir. Yalnizca admin (departmani
    olmayan kullanici) hedefi secebilir; sectigi bos ise kayit genel olur."""
    if not alan.sinirsiz:
        data.departman = alan.departman
    elif data.departman is not None and departman_crud.get(db, data.departman) is None:
        raise HTTPException(
            status_code=422, detail=f"Bilinmeyen departman: {data.departman}"
        )
    return crud.create_bolge(db, data, actor=user)


@router.patch("/{bolge_id}", response_model=BolgeCikti)
def bolge_guncelle(
    bolge_id: uuid.UUID,
    data: BolgeGuncelle,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Ad/aciklama/renk ozellestirmesi, sekil (geometri) ve mudurluk devri.

    Sekil gonderildiyse kaydin KENDI tipine gore dogrulanir - bir alan alan,
    bir guzergah cizgi olarak kalir (tip bu uctan degistirilemez)."""
    mevcut = _getir(db, bolge_id, alan)

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

    # Mudurluk devri yalnizca admin'in isi: bir mudurluk kendi kaydini
    # digerine "atarak" ya da genele birakarak kapsamdan cikaramamali.
    if "departman" in data.model_fields_set:
        if not alan.sinirsiz:
            raise HTTPException(
                status_code=403, detail="Müdürlük devri yalnızca admin tarafından yapılır"
            )
        if data.departman is not None and departman_crud.get(db, data.departman) is None:
            raise HTTPException(
                status_code=422, detail=f"Bilinmeyen departman: {data.departman}"
            )

    sonuc = crud.update_bolge(db, bolge_id, data, actor=user)
    if sonuc is None:
        raise HTTPException(status_code=404, detail="Bolge bulunamadi")
    return sonuc


@router.delete("/{bolge_id}", status_code=status.HTTP_204_NO_CONTENT)
def bolge_sil(
    bolge_id: uuid.UUID,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    _getir(db, bolge_id, alan)
    if not crud.delete_bolge(db, bolge_id, actor=user):
        raise HTTPException(status_code=404, detail="Bolge bulunamadi")


@router.post("/{bolge_id}/ata", response_model=BolgeCikti)
def bolge_ata(
    bolge_id: uuid.UUID,
    data: BolgeAtama,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Kaydi bir saha ekibine atar; worker_id=null atamayi kaldirir.

    EKIP KAYDIN MUDURLUGUNDEN olmalidir: Fen Isleri'nin cizdigi bir asfalt
    guzergahini Park ve Bahceler ekibine atamanin anlami yok. Kural admin icin
    uygulanmaz - varlik atamasindaki yaka/departman muafiyetiyle ayni desen:
    yetki personeldedir, arayuz karsi mudurlugu isaretleyip uyarir."""
    mevcut = _getir(db, bolge_id, alan)

    worker: User | None = None
    if data.worker_id is not None:
        worker = db.get(User, data.worker_id)
        if worker is None or worker.role != UserRole.saha_calisani:
            raise HTTPException(status_code=404, detail="Saha ekibi bulunamadi")
        if not alan.sinirsiz and mevcut.departman is not None:
            if worker.departman != mevcut.departman:
                raise HTTPException(
                    status_code=403,
                    detail="Bu ekip kaydın müdürlüğüne bağlı değil",
                )

    return crud.ata(db, bolge_id, worker, actor=user)


@router.post("/{bolge_id}/tamamla", response_model=BolgeCikti)
def bolge_tamamla(
    bolge_id: uuid.UUID,
    data: BolgeTamamlama,
    user: User = Depends(saha_dahil),
    # Rol token'dan cozulen etkin rolden okunur, `user.role` kolonundan degil
    # (bkz. security.py). `saha_dahil` ayni baglama dayandigi icin ek sorgu yok.
    baglam: OturumBaglami = Depends(get_context),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Bolgeyi/guzergahi tamamlandi isaretler; tamamlandi=false geri alir.

    Saha ekibi yalnizca KENDISINE atanan kaydi kapatabilir; personel (admin/
    calisan) kendi kapsamindaki her kaydi kapatip acabilir."""
    if baglam.etkin_rol is UserRole.saha_calisani:
        mevcut = crud.get_bolge(db, bolge_id)
        if mevcut is None:
            raise HTTPException(status_code=404, detail="Bolge bulunamadi")
        if mevcut.worker_id != user.id:
            raise HTTPException(status_code=403, detail="Bu bolge size atanmamis")
    else:
        _getir(db, bolge_id, alan)

    return crud.tamamla(db, bolge_id, data.tamamlandi, actor=user)

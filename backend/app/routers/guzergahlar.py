"""Kaydedilmis guzergahlar (cizgi). Bolgeler routers/bolgeler.py'de.

Kapsam kurali bolgelerdekiyle aynidir: kaydin kendi `departman` sutunundan
gecer, cunku bir guzergahin turu yoktur. Uc sekli de birebir aynidir - iki
kayit turu ayni ekranlarda yan yana kullanildigi icin arayuz tarafinda ayrisan
tek sey geometri.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import olaylar
from ..crud import departman as departman_crud
from ..crud import guzergah as crud
from ..crud.session import OturumBaglami
from ..database import get_db
from ..models.user import User, UserRole
from ..schemas.guzergah import (
    GuzergahAtama,
    GuzergahCikti,
    GuzergahGirdi,
    GuzergahGuncelle,
    GuzergahTamamlama,
)
from ..security import Kapsam, get_context, kapsam, personel, require_role, saha_dahil

router = APIRouter(prefix="/api/guzergahlar", tags=["guzergahlar"])


def _guzergah_degisti() -> None:
    """Guzergah degisti; `saha` da yayinlanir cunku kayit tekil bakim isleriyle
    ayni kotayi paylasir - atanmasi ekibin yukunu ve panolardaki sayaci
    degistirir (bkz. routers/bolgeler.py::_bolge_degisti)."""
    olaylar.yayinla("guzergahlar")
    olaylar.yayinla("saha")


def _kapsamda(mevcut: GuzergahCikti, alan: Kapsam) -> bool:
    """Kayit bu kullanicinin mudurlugune ya da genel havuza mi ait."""
    return (
        alan.sinirsiz
        or mevcut.departman is None
        or mevcut.departman == alan.departman
    )


def _getir(db: Session, guzergah_id: uuid.UUID, alan: Kapsam) -> GuzergahCikti:
    """Guzergahi kapsam kontroluyle getirir. Kapsam disi kayit icin 404 - 403
    degil: kaydin VARLIGI da baska mudurlugun bilgisidir."""
    mevcut = crud.get_guzergah(db, guzergah_id)
    if mevcut is None or not _kapsamda(mevcut, alan):
        raise HTTPException(status_code=404, detail="Guzergah bulunamadi")
    return mevcut


@router.get("/benim", response_model=list[GuzergahCikti])
def guzergahlarim(
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Saha ekibine atanmis guzergahlar (tamamlananlar dahil).

    Departman suzgeci GEREKMEZ: ekip zaten yalnizca kendisine ATANAN kaydi
    gorur ve atama kurali kaydin mudurluguyle uyumu garanti eder."""
    return crud.list_guzergahlarim(db, user.id)


@router.get("", response_model=list[GuzergahCikti], dependencies=[Depends(personel)])
def guzergahlar(alan: Kapsam = Depends(kapsam), db: Session = Depends(get_db)):
    """Personel: kaydedilmis guzergahlar. Admin tumunu, diger personel yalnizca
    KENDI MUDURLUGUNUN ve genel kayitlari gorur."""
    return crud.list_guzergahlar(
        db, departman=alan.departman, sinirli=not alan.sinirsiz
    )


@router.post("", response_model=GuzergahCikti, status_code=status.HTTP_201_CREATED)
def guzergah_olustur(
    data: GuzergahGirdi,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Yeni guzergah.

    Mudurluk istemciden gelen degere BIRAKILMAZ: departmani olan personelin
    kaydi her zaman kendi mudurlugune yazilir. Yalnizca admin (departmani
    olmayan kullanici) hedefi secebilir; sectigi bos ise kayit genel olur."""
    if not alan.sinirsiz:
        data.departman = alan.departman
    elif data.departman is not None and departman_crud.get(db, data.departman) is None:
        raise HTTPException(
            status_code=422, detail=f"Bilinmeyen departman: {data.departman}"
        )
    sonuc = crud.create_guzergah(db, data, actor=user)
    # Yeni kayit dogar dogmaz otomatik atanmis olabilir (create_guzergah icinde
    # guzergah_otomatik_ata): ekip ekraninda is o an belirmeli.
    _guzergah_degisti()
    return sonuc


@router.patch("/{guzergah_id}", response_model=GuzergahCikti)
def guzergah_guncelle(
    guzergah_id: uuid.UUID,
    data: GuzergahGuncelle,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Ad/aciklama/renk ozellestirmesi, sekil (geometri) ve mudurluk devri."""
    _getir(db, guzergah_id, alan)

    if data.noktalar is not None and (
        len(data.noktalar) != 1 or len(data.noktalar[0]) < 2
    ):
        raise HTTPException(
            status_code=422,
            detail="Güzergâh tek bir dizide en az 2 nokta içermelidir",
        )

    # Mudurluk devri yalnizca admin'in isi: bir mudurluk kendi kaydini
    # digerine "atarak" ya da genele birakarak kapsamdan cikaramamali.
    if "departman" in data.model_fields_set:
        if not alan.sinirsiz:
            raise HTTPException(
                status_code=403,
                detail="Müdürlük devri yalnızca admin tarafından yapılır",
            )
        if data.departman is not None and departman_crud.get(db, data.departman) is None:
            raise HTTPException(
                status_code=422, detail=f"Bilinmeyen departman: {data.departman}"
            )

    sonuc = crud.update_guzergah(db, guzergah_id, data, actor=user)
    if sonuc is None:
        raise HTTPException(status_code=404, detail="Guzergah bulunamadi")
    _guzergah_degisti()
    return sonuc


@router.delete("/{guzergah_id}", status_code=status.HTTP_204_NO_CONTENT)
def guzergah_sil(
    guzergah_id: uuid.UUID,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    _getir(db, guzergah_id, alan)
    if not crud.delete_guzergah(db, guzergah_id, actor=user):
        raise HTTPException(status_code=404, detail="Guzergah bulunamadi")
    _guzergah_degisti()


@router.post("/{guzergah_id}/ata", response_model=GuzergahCikti)
def guzergah_ata(
    guzergah_id: uuid.UUID,
    data: GuzergahAtama,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Kaydi bir saha ekibine atar; worker_id=null atamayi kaldirir.

    EKIP KAYDIN MUDURLUGUNDEN olmalidir: Fen Isleri'nin cizdigi bir asfalt
    guzergahini Park ve Bahceler ekibine atamanin anlami yok. Kural admin icin
    uygulanmaz - varlik atamasindaki yaka/departman muafiyetiyle ayni desen:
    yetki personeldedir, arayuz karsi mudurlugu isaretleyip uyarir."""
    mevcut = _getir(db, guzergah_id, alan)

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

    sonuc = crud.ata(db, guzergah_id, worker, actor=user)
    _guzergah_degisti()
    return sonuc


@router.post("/{guzergah_id}/tamamla", response_model=GuzergahCikti)
def guzergah_tamamla(
    guzergah_id: uuid.UUID,
    data: GuzergahTamamlama,
    user: User = Depends(saha_dahil),
    # Rol token'dan cozulen etkin rolden okunur, `user.role` kolonundan degil
    # (bkz. security.py). `saha_dahil` ayni baglama dayandigi icin ek sorgu yok.
    baglam: OturumBaglami = Depends(get_context),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Guzergahi tamamlandi isaretler; tamamlandi=false geri alir.

    Saha ekibi yalnizca KENDISINE atanan kaydi kapatabilir; personel (admin/
    calisan) kendi kapsamindaki her kaydi kapatip acabilir."""
    if baglam.etkin_rol is UserRole.saha_calisani:
        mevcut = crud.get_guzergah(db, guzergah_id)
        if mevcut is None:
            raise HTTPException(status_code=404, detail="Guzergah bulunamadi")
        if mevcut.worker_id != user.id:
            raise HTTPException(status_code=403, detail="Bu guzergah size atanmamis")
    else:
        _getir(db, guzergah_id, alan)

    sonuc = crud.tamamla(db, guzergah_id, data.tamamlandi, actor=user)
    # Tamamlama kapasite acar ve havuzu yeniden dagitir (crud/guzergah.py::
    # tamamla): baska bir ekibe o an yeni is dusmus olabilir.
    _guzergah_degisti()
    return sonuc

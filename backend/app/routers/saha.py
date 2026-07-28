import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..crud import asset as asset_crud
from ..crud import assignment as crud
from ..crud import yaka as yaka_crud
from ..database import get_db
from ..models.asset import AssetStatus
from ..models.user import User, UserRole
from ..schemas.saha import (
    AktifGorevBilgi,
    AtamaGirdi,
    EkipGorevleri,
    EkipOzet,
    GorevDurumu,
    GorevFeatureCollection,
    GorevOzet,
    GorevRef,
    HavuzVarlik,
    KonumGuncelle,
    VarlikRef,
)
from ..security import personel, require_role

router = APIRouter(prefix="/api/saha", tags=["saha"])


@router.post("/konum", status_code=status.HTTP_204_NO_CONTENT)
def konum_guncelle(
    data: KonumGuncelle,
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Saha calisaninin son konumunu gunceller (tarayici geolocation'i periyodik
    olarak cagirir)."""
    user.last_location = func.ST_SetSRID(
        func.ST_MakePoint(data.longitude, data.latitude), 4326
    )
    user.last_seen_at = datetime.now(timezone.utc)
    # Ekip yeni konumuyla havuzda bekleyen bir isin menziline girmis olabilir;
    # bekleyen gorevleri yeniden dagit (kapasite/mesafe uygunsa otomatik atanir).
    crud.bekleyen_gorevleri_dagit(db)
    db.commit()


@router.get("/gorevlerim", response_model=GorevFeatureCollection)
def gorevlerim(
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Giris yapan saha ekibinin aktif gorevleri (kendisine atanan varliklar)."""
    return GorevFeatureCollection.from_rows(crud.gorevlerim(db, user.id))


@router.get("/tamamlananlarim", response_model=GorevFeatureCollection)
def tamamlananlarim(
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Giris yapan saha ekibinin yakinda tamamladigi gorevler ('Tamamlanan
    İşler'). Yanlislikla tamamlanan bir is buradan geri alinabilir."""
    return GorevFeatureCollection.from_rows(crud.tamamlananlarim(db, user.id))


@router.post("/tamamlanan-geri-al", status_code=status.HTTP_204_NO_CONTENT)
def tamamlanan_geri_al(
    data: GorevRef,
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Saha ekibi yanlislikla tamamladigi bir gorevi geri alir (varlik yeniden
    'bakim_lazim', gorev yeniden 'atandi'). Kapasite dolu olsa bile izin verilir."""
    asset = crud.tamamlanani_geri_al(db, data.assignment_id, user.id)
    if asset is None:
        raise HTTPException(
            status_code=404,
            detail="Geri alinabilecek tamamlanmis gorev bulunamadi",
        )
    db.commit()


@router.get("/ekipler", response_model=list[EkipOzet])
def ekipler(
    _: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Personel (admin/calisan) tum saha ekiplerini konum + yuk ozetiyle gorur."""
    return [EkipOzet.from_row(r) for r in crud.ekipler_ozeti(db)]


@router.get("/ekip-gorevleri", response_model=list[EkipGorevleri])
def ekip_gorevleri(
    _: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Personel yonetim panosu: her ekip + kendine dusen aktif gorevler. Ekip
    ozetleri (konum/yuk) ile aktif atamalar tek seferde cekilip ekip bazinda
    gruplanir."""
    ozetler = crud.ekipler_ozeti(db)
    grup: dict[uuid.UUID, list[GorevOzet]] = {}
    for row in crud.aktif_atamalar(db):
        gorev = row[0]
        grup.setdefault(gorev.worker_id, []).append(GorevOzet.from_row(row))
    return [
        EkipGorevleri(
            id=o.id,
            full_name=o.full_name,
            email=o.email,
            longitude=o.longitude,
            latitude=o.latitude,
            last_seen_at=o.last_seen_at,
            aktif_gorev=o.aktif_gorev,
            yaka=o.yaka,
            gorevler=grup.get(o.id, []),
        )
        for o in ozetler
    ]


@router.get("/havuz", response_model=list[HavuzVarlik])
def havuz(
    _: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Personel: havuzda bekleyen (henuz bir ekibe atanmamis) bakim varliklari.
    Buradan elle bir ekibe atanabilir (POST /ata)."""
    return [HavuzVarlik.from_row(r) for r in crud.havuz_varliklari(db)]


@router.post("/ata", status_code=status.HTTP_204_NO_CONTENT)
def ata(
    data: AtamaGirdi,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Personel bir bakim varligini elle bir ekibe (yeniden) yonlendirir."""
    row = asset_crud.get_asset(db, data.asset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    asset = row[0]
    if asset.status != AssetStatus.bakim_lazim:
        raise HTTPException(
            status_code=409, detail="Yalnizca bakim bekleyen varliklar atanabilir"
        )

    worker = db.get(User, data.worker_id)
    if worker is None or worker.role != UserRole.saha_calisani:
        raise HTTPException(status_code=404, detail="Saha ekibi bulunamadi")

    try:
        crud.ata(db, asset, worker, assigned_by=user)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()


@router.get("/gorev/{asset_id}", response_model=GorevDurumu)
def gorev_bilgi(
    asset_id: uuid.UUID,
    _: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Bir varligin su an atali oldugu ekip (yoksa null: havuzda bekliyor) +
    varligin hangi yakada oldugu. Elle yonlendirme ekraninda 'once hangi ekipteydi'
    ve 'secilen ekip karsi yakada mi' gostermek icin."""
    gorev = crud.aktif_gorev_bilgisi(db, asset_id)
    row = asset_crud.get_asset(db, asset_id)
    kod = yaka_crud.yaka_bul(db, row[0].geometry) if row is not None else None
    return GorevDurumu(
        gorev=AktifGorevBilgi(**gorev) if gorev else None,
        varlik_yaka=kod,
        varlik_yaka_ad=yaka_crud.yaka_adlari(db).get(kod) if kod else None,
    )


@router.post("/geri-al", status_code=status.HTTP_204_NO_CONTENT)
def geri_al(
    data: VarlikRef,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Personel bir varligin aktif gorevini iptal edip varligi havuza dondurur."""
    row = asset_crud.get_asset(db, data.asset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    if not crud.geri_al(db, data.asset_id, actor=user):
        raise HTTPException(status_code=409, detail="Bu varligin aktif bir gorevi yok")
    db.commit()

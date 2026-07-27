from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..crud import asset as asset_crud
from ..crud import assignment as crud
from ..database import get_db
from ..models.asset import AssetStatus
from ..models.user import User, UserRole
from ..schemas.saha import AtamaGirdi, EkipOzet, GorevFeatureCollection, KonumGuncelle
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
    db.commit()


@router.get("/gorevlerim", response_model=GorevFeatureCollection)
def gorevlerim(
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Giris yapan saha ekibinin aktif gorevleri (kendisine atanan varliklar)."""
    return GorevFeatureCollection.from_rows(crud.gorevlerim(db, user.id))


@router.get("/ekipler", response_model=list[EkipOzet])
def ekipler(
    _: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Personel (admin/calisan) tum saha ekiplerini konum + yuk ozetiyle gorur."""
    return [EkipOzet.from_row(r) for r in crud.ekipler_ozeti(db)]


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

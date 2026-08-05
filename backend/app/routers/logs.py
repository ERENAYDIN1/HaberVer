from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..crud import log as crud
from ..database import get_db
from ..schemas.log import LogOut
from ..security import Kapsam, kapsam, personel

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=list[LogOut], dependencies=[Depends(personel)])
def list_logs(
    limit: int = Query(default=200, ge=1, le=500),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Islem gecmisi (audit log). Admin tumunu gorur; diger personel yalnizca
    kendi mudurlugunun kayitlarini + departmana ozel olmayan islemleri
    (bolge/kullanici) gorur - liste uclari departmana gore suzuluyorken gecmis
    acik kalsaydi kural katman degistirir gibi gorunurdu."""
    return [
        LogOut.model_validate(log)
        for log in crud.list_logs(
            db,
            limit=limit,
            kapsam_departmani=None if alan.sinirsiz else alan.departman,
        )
    ]

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..crud import log as crud
from ..database import get_db
from ..schemas.log import LogOut
from ..security import personel

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=list[LogOut], dependencies=[Depends(personel)])
def list_logs(
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Sistem genelindeki islem gecmisi (audit log); yalnizca admin/calisan gorur."""
    return [LogOut.model_validate(log) for log in crud.list_logs(db, limit=limit)]

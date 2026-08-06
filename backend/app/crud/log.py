import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models.asset import AssetType
from ..models.log import ActivityLog, LogAction
from ..models.user import User
from .departman import tur_departmani


def add_log(
    db: Session,
    *,
    action: LogAction,
    actor: User | None,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    entity_name: str | None = None,
    detail: str | None = None,
    tur: AssetType | None = None,
    departman: str | None = None,
) -> ActivityLog:
    """Log kaydini olusturup session'a ekler; commit cagirmaz - ait oldugu
    islemin (asset/report/user degisikligi) commit'iyle birlikte atomik
    yazilsin diye cagiran taraf commit eder.

    `tur` verilirse kaydin departmani O ANDA cozulur ve satira yazilir. Bu,
    silme kayitlarinin okunabilir kalmasi icin sart: varlik silindikten sonra
    turu - dolayisiyla hangi mudurlugun isi oldugu - artik ogrenilemez.

    `departman` ise turu OLMAYAN kayitlar icindir (gorev bolgeleri): mudurluk
    kaydin kendi sutunundadir, turden cozulemez. Ikisi birlikte verilmez."""
    log = ActivityLog(
        action=action,
        actor_id=actor.id if actor else None,
        actor_name=(actor.full_name or actor.email) if actor else None,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        detail=detail,
        departman=(
            tur_departmani(db, tur) if tur is not None else departman
        ),
    )
    db.add(log)
    return log


def list_logs(
    db: Session, limit: int = 200, kapsam_departmani: str | None = None
) -> list[ActivityLog]:
    """Islem gecmisi. `kapsam_departmani` verilirse (admin disi personel)
    yalnizca o mudurlugun kayitlari + departmana ozel OLMAYAN kayitlar
    (bolge, kullanici islemleri) dondurulur."""
    stmt = select(ActivityLog)
    if kapsam_departmani is not None:
        stmt = stmt.where(
            or_(
                ActivityLog.departman.is_(None),
                ActivityLog.departman == kapsam_departmani,
            )
        )
    stmt = stmt.order_by(ActivityLog.created_at.desc()).limit(limit)
    return list(db.execute(stmt).scalars())
